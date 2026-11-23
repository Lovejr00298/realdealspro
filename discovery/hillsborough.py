"""Fetch Hillsborough's clerk-published tax-deed surplus candidates."""
from datetime import datetime
from io import BytesIO
import json
import math
import re
import subprocess

from openpyxl import load_workbook

REPORT = "https://www.hillsclerk.com/documents/d/guest/copy-of-weekly-tax-deed-spreadsheet-25-10-10-xlsx?download=true"


def fetch_candidates():
    download = subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location",
         "--proto", "=https", "--proto-redir", "=https",
         "--connect-timeout", "8", "--max-time", "20", "--retry", "2",
         "--max-filesize", "5242880", REPORT],
        check=True, capture_output=True, timeout=65,
    )
    workbook = load_workbook(BytesIO(download.stdout), read_only=True, data_only=True)
    try:
        rows = iter(workbook["Tax Deed"].values)
        date_line = str(next(rows)[0])
        match = re.fullmatch(r"as of (\d{1,2}/\d{1,2}/\d{4})", date_line.strip(), re.I)
        if not match or tuple(next(rows)[:2]) != ("CASE NUMBER", "BALANCE"):
            raise ValueError("Unexpected Hillsborough workbook layout")
        report_date = datetime.strptime(match[1], "%m/%d/%Y").date().isoformat()
        candidates = {}
        for case, amount, *_ in rows:
            if not isinstance(case, str) or not re.fullmatch(r"\d{2}-[A-Z]+-\d+", case.strip()):
                continue
            if not isinstance(amount, (int, float)) or not math.isfinite(amount):
                raise ValueError(f"Invalid balance for {case}")
            if amount > 0:
                candidates[case.strip()] = {
                    "county": "Hillsborough", "taxDeedId": case.strip(),
                    "reportedBalance": round(amount, 2), "reportDate": report_date,
                    "source": REPORT,
                }
        return list(candidates.values())
    finally:
        workbook.close()


if __name__ == "__main__":
    print(json.dumps(fetch_candidates(), indent=2))
