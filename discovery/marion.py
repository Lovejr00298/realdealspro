"""Read Marion County's weekly tax deed surplus report."""
from datetime import datetime
from decimal import Decimal
from html.parser import HTMLParser
import re
import subprocess
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen

INDEX = "https://www.marioncountyclerk.org/departments/records-recording/tax-deeds-and-lands-available-for-taxes/unclaimed-funds/"
ROW = re.compile(r"^\s*\d{4}-\d{2}-\d{2}\s+(\d+(?:[ ]*[A-Z])?)\s+\d+\s+([\w-]+)\s+\$\s*(-?\d[\d,]*\.\d{2})(?=\s|$)")


class ReportLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = set()

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag != "a" or not href:
            return
        url = urljoin(INDEX, href)
        parts = urlsplit(url)
        if (parts.scheme == "https" and parts.netloc == "www.marioncountyclerk.org"
                and re.fullmatch(r"/uploads/\d{4}/\d{2}/(?:Copy-of-)?Tax-Deeds-Surplus-Funds[^/]*\.pdf", parts.path, re.I)):
            self.links.add(url)


def parse_report(content, source):
    dates = set(re.findall(r"Report run on (\d{2}/\d{2}/\d{4})", content))
    if "Tax Deeds Surplus Funds Report" not in content or len(dates) != 1:
        raise ValueError("Unrecognized Marion report")
    report_date = datetime.strptime(dates.pop(), "%m/%d/%Y").date().isoformat()
    records = {}
    found = False
    for line in content.splitlines():
        match = ROW.match(line)
        if not match:
            if re.match(r"^\s*\d{4}-\d{2}-\d{2}\s+\d", line):
                raise ValueError("Unrecognized Marion balance row")
            continue
        found = True
        sale, parcel, raw_balance = match.groups()
        sale = sale.replace(" ", "")
        balance = Decimal(raw_balance.replace(",", ""))
        key = (sale, parcel.upper())
        row = dict(taxDeedId=sale, parcelId=parcel.upper(),
                   reportedBalance=float(balance), source=source, reportDate=report_date)
        if key in records and records[key] != row:
            raise ValueError("Conflicting Marion balances for the same sale and parcel")
        records[key] = row
    if not found:
        raise ValueError("No recognizable Marion balance rows")
    return [row for row in records.values() if row["reportedBalance"] > 0]


def fetch_marion():
    with urlopen(INDEX, timeout=25) as page:
        parser = ReportLinks()
        parser.feed(page.read().decode("utf-8", errors="replace"))
    if len(parser.links) != 1:
        raise ValueError("Expected one official Marion surplus report link")
    source = parser.links.pop()
    with urlopen(source, timeout=30) as response:
        pdf = response.read(12_000_001)
    if not pdf.startswith(b"%PDF-") or len(pdf) > 12_000_000:
        raise ValueError("Invalid Marion PDF")
    result = subprocess.run(["pdftotext", "-layout", "-", "-"], input=pdf,
                            capture_output=True, check=True, timeout=30)
    return parse_report(result.stdout.decode("utf-8"), source)
