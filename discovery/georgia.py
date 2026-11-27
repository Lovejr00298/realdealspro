"""Read Georgia tax commissioner excess-funds lists (DeKalb, Gwinnett, Cobb) into source-linked review candidates."""
from datetime import datetime
from io import BytesIO
import json
import re
from urllib.request import Request, urlopen

from pypdf import PdfReader

DEKALB = "https://dekalbtaxga.gov/wp-content/uploads/Excess-Funds-List.pdf"
DEKALB_PAGE = "https://www.dekalbtax.org/excess-funds"
GWINNETT = "https://www.gwinnetttaxcommissioner.com/documents/d/egov/excess-funds-all-years?download=true"
GWINNETT_PAGE = "https://www.gwinnetttaxcommissioner.com/property-tax/tax-sale-excess-funds"
COBB_PAGE = "https://www.cobbtax.gov/property/delinquent_taxes/index.php"
AGENT = {"User-Agent": "Mozilla/5.0 (RealDealsPro county discovery)"}
AMOUNT = r"\$([\d,]+\.\d{2})"


def fetch(url):
    with urlopen(Request(url, headers=AGENT), timeout=30) as response:
        return response.read()


def pdf_text(data):
    if not data.startswith(b"%PDF"):
        raise ValueError("Source did not return a PDF")
    return "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(data)).pages)


def money(text):
    return round(float(text.replace(",", "")), 2)


def parse_dekalb(text, source=DEKALB):
    as_of = re.search(r"As of (\d{1,2}/\d{1,2}/\d{4})", text)
    report = datetime.strptime(as_of[1], "%m/%d/%Y").date().isoformat() if as_of else None
    rows = re.findall(r"^(\d{2} \d{3} \d{2} \d{3}[A-Z]?) " + AMOUNT + r" (\d{1,2}/\d{1,2}/\d{4}) (.+?)$", text, re.M)
    return [{"county": "DeKalb, GA", "taxDeedId": parcel, "parcelId": parcel, "reportedBalance": money(amount),
             "saleDate": datetime.strptime(sale, "%m/%d/%Y").date().isoformat(), "formerOwnerAndSitus": rest.strip(),
             "reportDate": report, "source": source} for parcel, amount, sale, rest in rows if money(amount) > 0]


def parse_gwinnett(text, source=GWINNETT_PAGE):
    updated = re.search(r"Updated (\d{1,2}/\d{1,2}/\d{4})", text)
    report = datetime.strptime(updated[1], "%m/%d/%Y").date().isoformat() if updated else None
    rows = re.findall(r"^(.+?) (R\d{4} ?[A-Z]?\d{3}[A-Z]?) (.+?) " + AMOUNT + r" ([A-Z][a-z]+ \d{4})\s*$", text, re.M)
    return [{"county": "Gwinnett, GA", "taxDeedId": parcel, "parcelId": parcel, "reportedBalance": money(amount),
             "saleMonth": sale, "formerOwnerAndSitus": rest.strip(), "reportDate": report, "source": source}
            for _, parcel, rest, amount, sale in rows if money(amount) > 0]


def parse_cobb(text, source=COBB_PAGE):
    dated = re.search(r"Excess Funds\s*\n(\d{1,2}/\d{1,2}/\d{4})", text)
    report = datetime.strptime(dated[1], "%m/%d/%Y").date().isoformat() if dated else None
    rows = re.findall(r"^(\d{1,2}/\d{1,2}/\d{4}) (.+?)(\d{2}-\d{4}-\d-\d{3}-\d) " + AMOUNT + r" (Yes|No|Y|N)?", text, re.M)
    return [{"county": "Cobb, GA", "taxDeedId": parcel, "parcelId": parcel, "reportedBalance": money(amount),
             "saleDate": datetime.strptime(sale, "%m/%d/%Y").date().isoformat(), "pendingClaim": (pending or "").startswith("Y"),
             "reportDate": report, "source": source} for sale, _, parcel, amount, pending in rows if money(amount) > 0]


def cobb_pdf_url():
    page = fetch(COBB_PAGE).decode("utf-8", errors="replace")
    names = re.findall(r'href="(Excess Funds[^"]+\.pdf)"', page, re.I)
    if not names:
        raise ValueError("No Cobb excess funds list linked on the tax commissioner page")
    return "https://www.cobbtax.gov/" + names[0].replace(" ", "%20")


def fetch_dekalb():
    return parse_dekalb(pdf_text(fetch(DEKALB)))


def fetch_gwinnett():
    return parse_gwinnett(pdf_text(fetch(GWINNETT)))


def fetch_cobb():
    return parse_cobb(pdf_text(fetch(cobb_pdf_url())))


def checked(records, county):
    if not records:
        raise ValueError(f"No {county} excess-funds rows recognized; the list format may have changed")
    return records


if __name__ == "__main__":
    print(json.dumps({"DeKalb, GA": fetch_dekalb(), "Gwinnett, GA": fetch_gwinnett(), "Cobb, GA": fetch_cobb()}, indent=2))
