"""Read official clerk foreclosure sale lists and unclaimed-money notices."""
from datetime import datetime
from io import BytesIO
import re
import sys

from pypdf import PdfReader

from georgia import fetch, money, pdf_text

OSCEOLA_SALES = "https://courts.osceolaclerk.com/reports/CivilMortgageForeclosuresWeb.pdf"
BAY_SALES = "https://apps.baycoclerk.com/Downloads/ForeclosureSales.pdf"
VOLUSIA_UNCLAIMED = "https://www.clerk.org/pdf/notices/2026-Unclaimed-Payments-Notice.pdf"
MANATEE_UNCLAIMED = "https://www.manateeclerk.com/media/2793/unclaimed-funds-2026.pdf"


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
        if "CANCEL" in detail.upper():
            continue
        address = " ".join(line.strip() for line in detail.splitlines()
                           if line.strip() and not re.search(r"SALE WILL BE HELD|realforeclose", line, re.I))
        sales.append({"county": "Bay", "caseNo": case, "saleDate": iso(sale, "%m-%d-%Y"),
                      "judgment": money(amount), "address": address, "source": source})
    return sales


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
    return {
        "Osceola": lambda: parse_osceola_sales(pdf_text(fetch(OSCEOLA_SALES))),
        "Bay": lambda: parse_bay_sales(pdf_text(fetch(BAY_SALES))),
    }


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
