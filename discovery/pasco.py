"""Read the Pasco Clerk surplus workbook and emit source-linked review candidates."""
import argparse
from datetime import datetime
import json
import math
from html.parser import HTMLParser
from io import BytesIO
import re
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import urlopen

from openpyxl import load_workbook

REPORT_PAGE = "https://app.pascoclerk.com/appdot-public-statistical-reports-taxdeeds.asp"
COLUMNS = {"DATE RECEIVED", "TDA #", "ORIGINAL OWNER", "PARCEL ID #", "ACTUAL BALANCE", "BALANCE"}


class ReportLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.workbooks = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag != "a" or not href:
            return
        url = urljoin(REPORT_PAGE, href)
        parts = urlparse(url)
        if parts.scheme != "https" or parts.netloc != "app.pascoclerk.com":
            return
        path = unquote(parts.path)
        match = re.fullmatch(r"/public_records/tax-deeds/Unclaimed Tax Deed Surplus (\d{8})\.xlsx", path, re.I)
        if match:
            self.workbooks.append((match[1], url))


def fetch_latest():
    links = ReportLinks()
    with urlopen(REPORT_PAGE, timeout=20) as response:
        links.feed(response.read().decode("utf-8", errors="replace"))
    if not links.workbooks:
        raise ValueError("No Pasco surplus workbook found on the clerk reports page")
    report_stamp, url = max(links.workbooks)
    report_date = datetime.strptime(report_stamp, "%Y%m%d").date().isoformat()
    with urlopen(url, timeout=20) as response:
        records = read_candidates(BytesIO(response.read()))
    for record in records:
        record["source"] = url
        record["reportDate"] = report_date
    return records


def read_candidates(path):
    candidates = {}
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        for sheet in workbook:
            columns = None
            for row in sheet.values:
                if columns is None:
                    labels = {str(value or "").strip().upper(): i for i, value in enumerate(row)}
                    if COLUMNS <= labels.keys():
                        columns = labels
                    continue
                received = row[columns["DATE RECEIVED"]]
                if not isinstance(received, datetime):
                    continue
                case = str(row[columns["TDA #"]] or "").strip()
                if not case:
                    continue
                balance = row[columns["BALANCE"]]
                if balance is None:
                    if any(row[columns[name]] is not None for name in ("DATE PAID", "AMOUNT PAID") if name in columns):
                        raise ValueError(f"Missing remaining balance for {case}")
                    balance = row[columns["ACTUAL BALANCE"]]
                if not isinstance(balance, (int, float)) or not math.isfinite(balance):
                    raise ValueError(f"Invalid balance for {case}")
                candidates[case.upper()] = {
                    "county": "Pasco", "taxDeedId": case,
                    "parcelId": str(row[columns["PARCEL ID #"]] or "").strip(),
                    "formerOwner": str(row[columns["ORIGINAL OWNER"]] or "").strip(),
                    "reportedBalance": round(balance, 2),
                    "receivedDate": received.date().isoformat(),
                    "source": REPORT_PAGE, "worksheet": sheet.title,
                }
            if columns is None:
                raise ValueError(f"Unrecognized report columns in {sheet.title}")
    finally:
        workbook.close()
    return [record for record in candidates.values() if record["reportedBalance"] > 0]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", nargs="?", help="Use a local XLSX instead of fetching the latest report")
    args = parser.parse_args()
    print(json.dumps(read_candidates(args.workbook) if args.workbook else fetch_latest(), indent=2))
