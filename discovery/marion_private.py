"""Build owner-only Marion snapshots from the two official PDF text extracts."""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from marion import ROW, parse_report

SURPLUS = "https://www.marioncountyclerk.org/uploads/2026/11/Copy-of-Tax-Deeds-Surplus-Funds-2026-11-20.pdf"
CHECKS = "https://www.marioncountyclerk.org/uploads/2026/04/Stale-Dated-checks-Web-040426.pdf"
CHECK_ROW = re.compile(r"^\s*(\d{2}/\d{2}/\d{2})\s+(\d+)\s+([\d,]+\.\d{2})\s+(.+?)\s*$")


def names_by_sale(surplus_text):
    names = {}
    for line in surplus_text.splitlines():
        match = ROW.match(line)
        if match:
            sale, parcel, _ = match.groups()
            name = line[match.end():].strip()
            if name:
                names.setdefault((sale.replace(" ", ""), parcel.upper()), set()).add(name)
    return names


def snapshots(surplus_text, checks_text):
    balances = parse_report(surplus_text, SURPLUS)
    names = names_by_sale(surplus_text)
    assessed = []
    for row in balances:
        matches = names.get((row["taxDeedId"], row["parcelId"]), set())
        if len(matches) == 1:
            assessed.append({**row, "name": next(iter(matches))})
    if not assessed or "PAYABLE TO" not in checks_text:
        raise ValueError("Missing expected Marion records")
    checks = {}
    for line in checks_text.splitlines():
        match = CHECK_ROW.fullmatch(line)
        if not match:
            if re.match(r"^\s*\d{2}/\d{2}/\d{2}", line):
                raise ValueError("Unrecognized check row")
            continue
        date, number, amount, name = match.groups()
        row = dict(reference=number, name=name, amount=float(amount.replace(",", "")),
                   checkDate=datetime.strptime(date, "%m/%d/%y").date().isoformat())
        if number in checks and checks[number] != row:
            raise ValueError("Conflicting check rows")
        if row["amount"] > 0:
            checks[number] = row
    if not checks:
        raise ValueError("No positive check rows")
    return [
        dict(kind="surplus", report_date=balances[0]["reportDate"], source=SURPLUS, records=assessed),
        dict(kind="unclaimed", report_date="2026-04-04", source=CHECKS, records=list(checks.values())),
    ]


if __name__ == "__main__":
    print(json.dumps(snapshots(*(Path(path).read_text() for path in sys.argv[1:]))))
