"""Convert Osceola Clerk report text to a dated snapshot for review."""

import argparse
from datetime import datetime
from decimal import Decimal
import json
from pathlib import Path
import re

REPORT = "https://courts.osceolaclerk.com/reports/TaxDeedsSurplusFundsAvailableWeb.pdf"
ROW = re.compile(
    r"\s*(\d+(?:-\d{4})?)\s+\d+\s+"
    r"\$([\d,]+\.\d{2})\s+(?:.*?\s+)?([A-Z0-9]{18})\s*"
)


def parse_snapshot(report):
    dates = set(re.findall(r"Report Date:\s*(\d{1,2}/\d{1,2}/\d{4})", report))
    if len(dates) != 1 or "Tax Deeds Surplus Funds Available" not in report:
        raise ValueError("Expected one Osceola surplus report date")
    date = datetime.strptime(dates.pop(), "%m/%d/%Y").date().isoformat()
    accepted = {}
    rejected = set()
    for line in report.splitlines():
        row = ROW.fullmatch(line)
        if not row:
            if "$" in line and re.match(r"\s*\d", line):
                raise ValueError("Unrecognized surplus row")
            continue
        case, amount, parcel = row.groups()
        if "-" not in case:
            rejected.add(case)
            continue
        number, year = case.split("-")
        case = f"{int(number):03d}-{year}"
        balance = Decimal(amount.replace(",", ""))
        if balance <= 0:
            continue
        record = {
            "taxDeedId": case, "reportedBalance": float(balance),
            "reportDate": date, "parcelId": parcel, "source": REPORT,
        }
        if case in accepted and accepted[case] != record:
            rejected.add(case)
        accepted[case] = record
    records = [record for case, record in accepted.items() if case not in rejected]
    if not records:
        raise ValueError("No eligible Osceola surplus records")
    return {"status": "ok", "stale": True, "records": records}, sorted(rejected)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report_text", type=Path)
    args = parser.parse_args()
    snapshot, rejected = parse_snapshot(args.report_text.read_text(encoding="utf-8"))
    print(json.dumps({"snapshot": snapshot, "excludedCaseIds": rejected}, indent=2))
