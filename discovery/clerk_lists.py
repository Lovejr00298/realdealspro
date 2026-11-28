"""Read official clerk foreclosure sale lists and unclaimed-money notices."""
from datetime import datetime, timedelta
import html
from io import BytesIO
import re
import sys

from pypdf import PdfReader

from georgia import fetch, money, pdf_text

OSCEOLA_SALES = "https://courts.osceolaclerk.com/reports/CivilMortgageForeclosuresWeb.pdf"
BAY_SALES = "https://apps.baycoclerk.com/Downloads/ForeclosureSales.pdf"
VOLUSIA_UNCLAIMED = "https://www.clerk.org/pdf/notices/2026-Unclaimed-Payments-Notice.pdf"
MANATEE_UNCLAIMED = "https://www.manateeclerk.com/media/2793/unclaimed-funds-2026.pdf"
VOLUSIA_SALES = "https://app02.clerk.org/cm_sales/"
CHARLESTON_SALES = "https://www.charlestoncounty.gov/foreclosure/runninglist.html"
NC_TRUSTEE_SALES = "https://fletchertydings.com/foreclosure-sales/"


def layout_text(data):
    if not data.startswith(b"%PDF"):
        raise ValueError("Source did not return a PDF")
    return "\n".join(page.extract_text(extraction_mode="layout") or "" for page in PdfReader(BytesIO(data)).pages)


def iso(text, fmt):
    return datetime.strptime(text, fmt).date().isoformat()


def parse_osceola_sales(text, source=OSCEOLA_SALES):
    sales = []
    for sale, case, plaintiff in re.findall(r"^(\d{2}/\d{2}/\d{4})\s*\n(\d{4} C[AC] \d{6} [A-Z]{2})\s*\n(.+?)\nvs\.", text, re.M | re.S):
        sales.append({"county": "Osceola", "caseNo": case, "saleDate": iso(sale, "%m/%d/%Y"),
                      "plaintiff": " ".join(plaintiff.split()), "source": source})
    return sales


def parse_bay_sales(text, source=BAY_SALES):
    sales = []
    for case, detail, sale, amount in re.findall(r"^(\d{8}CA)\s*\n(.*?)(\d{2}-\d{2}-\d{4})\s*\n\$([\d,]+\.\d{2})", text, re.M | re.S):
        address = " ".join(line.strip() for line in detail.splitlines()
                           if line.strip() and not re.search(r"SALE WILL BE HELD|realforeclose|CANCEL", line, re.I))
        record = {"county": "Bay", "caseNo": case, "saleDate": iso(sale, "%m-%d-%Y"),
                  "judgment": money(amount), "address": address, "source": source}
        if "CANCEL" in detail.upper():
            record["canceled"] = True
        sales.append(record)
    return sales


def table_rows(page):
    """Each <tr> as a list of cell texts, with inner tags turned into single spaces."""
    cell = lambda raw: " ".join(html.unescape(re.sub(r"<[^>]+>", " ", raw)).split())
    return [[cell(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S | re.I)]
            for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S | re.I)]


def plaintiff_of(style):
    return " ".join(style.split(" v. ")[0].split())


def parse_volusia_sales(page, source=VOLUSIA_SALES):
    sales = []
    for block in re.split(r'(?=<span id="[^"]*dobLabel")', page)[1:]:
        day = re.search(r"dobLabel[^>]*>(\d{2}/\d{2}/\d{4})", block)
        if not day:
            continue
        for case, style in re.findall(r'<a[^>]*link1"[^>]*>([^<]+)</a>.*?label1">([^<]*)</span>', block, re.S):
            style = " ".join(html.unescape(style).split())
            record = {"county": "Volusia", "caseNo": " ".join(case.split()), "saleDate": iso(day[1], "%m/%d/%Y"), "source": source}
            if style.startswith("Cancelled:"):
                record["canceled"] = True
                style = style[len("Cancelled:"):]
            record["plaintiff"] = plaintiff_of(style)
            sales.append(record)
    return sales


def parse_charleston_sales(page, source=CHARLESTON_SALES):
    sales = []
    for cells in table_rows(page):
        match = len(cells) >= 8 and re.match(r"(\d{2}-\d{2}-\d{2}).*?(\d{2}-\d{5})\s*$", cells[0])
        if not match:
            continue
        address = re.sub(r"^\d{10}\s*", "", cells[3])
        record = {"county": "Charleston, SC", "caseNo": match[2], "saleDate": iso(match[1], "%m-%d-%y"),
                  "plaintiff": cells[1], "address": ", ".join(filter(None, [address, cells[7], "SC"])),
                  "parcelId": cells[3][:10], "lien": cells[5], "source": source}
        if re.search(r"[\d,]+\.\d{2}", cells[4]):
            record["judgment"] = money(re.search(r"[\d,]+\.\d{2}", cells[4])[0])
        sales.append(record)
    return sales


def parse_nc_trustee_sales(page, source=NC_TRUSTEE_SALES):
    """A North Carolina foreclosure trustee's posted list of its upcoming and open-for-upset-bid sales."""
    sales = []
    for cells in table_rows(page):
        if len(cells) < 6 or not re.fullmatch(r"\d{2}SP\d{6}-\d{3}", cells[1]):
            continue
        day = re.match(r"(\d{2}/\d{2}/\d{4})", cells[3])
        if not day:
            continue
        record = {"county": "North Carolina (trustee list)", "location": cells[0].strip() + " County", "caseNo": cells[1], "saleDate": iso(day[1], "%m/%d/%Y"),
                  "address": cells[2], "parcelId": cells[4], "source": source}
        bid = re.search(r"[\d,]+\.\d{2}", cells[5])
        if bid:
            record["bid"] = money(bid[0])
        sales.append(record)
    return sales


def volusia_sales_page():
    """The clerk shows the sale list after a disclaimer postback, so keep the session cookie between requests."""
    import http.cookiejar
    import urllib.parse
    import urllib.request
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = [("User-Agent", "Mozilla/5.0 RealDealsPro")]
    first = opener.open(VOLUSIA_SALES, timeout=60)
    form = dict(re.findall(r'<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"', first.read().decode("utf-8", "replace")))
    form.update({"__EVENTTARGET": "ctl00$Content1$button_accept", "__EVENTARGUMENT": ""})
    return opener.open(first.geturl(), urllib.parse.urlencode(form).encode(), timeout=60).read().decode("utf-8", "replace")


def parse_volusia_unclaimed(text, source=VOLUSIA_UNCLAIMED):
    rows = re.findall(r"^\s*(\S.*?)\s{2,}(\S+)\s+(\d{1,2}/\d{1,2}/\d{4})\s+(\S.*?)\s{2,}([\d,]+\.\d{2})\s*$", text, re.M)
    return [{"county": "Volusia", "name": name, "reference": ref, "date": iso(date, "%m/%d/%Y"),
             "category": category, "amount": money(amount), "source": source}
            for name, ref, date, category, amount in rows if money(amount) > 0]


def parse_manatee_unclaimed(text, source=MANATEE_UNCLAIMED):
    rows = re.findall(r"^(\S.*?) \$([\d,]+\.\d ?\d) ?(.*?)\s*$", text, re.M)
    return [{"county": "Manatee", "name": " ".join(name.split()), "reference": " ".join(ref.split()),
             "amount": money(amount.replace(" ", "")), "source": source}
            for name, amount, ref in rows if money(amount.replace(" ", "")) > 0]


def foreclosure_sales():
    sources = {
        "Osceola": lambda: parse_osceola_sales(pdf_text(fetch(OSCEOLA_SALES))),
        "Bay": lambda: parse_bay_sales(pdf_text(fetch(BAY_SALES))),
        "Volusia": lambda: parse_volusia_sales(volusia_sales_page()),
        "Charleston, SC": lambda: parse_charleston_sales(fetch(CHARLESTON_SALES).decode("utf-8", "replace")),
    }
    sources["North Carolina (trustee list)"] = lambda: parse_nc_trustee_sales(fetch(NC_TRUSTEE_SALES).decode("utf-8", "replace"))
    return sources


def unclaimed_lists():
    return {
        "Volusia": lambda: parse_volusia_unclaimed(layout_text(fetch(VOLUSIA_UNCLAIMED))),
        "Manatee": lambda: parse_manatee_unclaimed(pdf_text(fetch(MANATEE_UNCLAIMED))),
        "Marion": marion_checks,
    }


def marion_checks():
    from marion_private import CHECKS, CHECK_ROW
    rows = [CHECK_ROW.fullmatch(line) for line in layout_text(fetch(CHECKS)).splitlines()]
    return [{"county": "Marion", "name": m[4], "reference": m[2], "date": iso(m[1], "%m/%d/%y"),
             "amount": money(m[3]), "source": CHECKS} for m in rows if m and money(m[3]) > 0]


def merge_sale_history(current, previous, today, keep_days=120):
    """Keep sales that dropped off a clerk list after their sale date so the app can flag them for a surplus check."""
    cutoff, now = (today - timedelta(days=keep_days)).isoformat(), today.isoformat()
    merged = {}
    for county, result in current.items():
        old = (previous or {}).get(county) or {}
        old_records = old.get("records", []) if old.get("status") == "ok" else []
        if result.get("status") != "ok":
            kept = [r for r in old_records if r.get("saleDate", "") >= cutoff]
            merged[county] = {"status": "ok", "stale": True, "records": kept} if kept else result
            continue
        seen = {r["caseNo"] for r in result["records"]}
        dropped = [{**r, "dropped": True} for r in old_records
                   if r["caseNo"] not in seen and not r.get("canceled") and cutoff <= r.get("saleDate", "") <= now]
        merged[county] = {**result, "records": result["records"] + dropped}
    return merged


def gather(sources):
    results = {}
    for county, load in sources.items():
        try:
            records = load()
            if not records:
                raise ValueError("no rows parsed")
            results[county] = {"status": "ok", "records": records}
        except Exception as error:
            print(f"{county}: {error}", file=sys.stderr)
            results[county] = {"status": "error"}
    return results
