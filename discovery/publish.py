"""Generate the public county queue without names or internal error details."""
from datetime import date
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen

import osceola
from clerk_lists import foreclosure_sales, gather, merge_sale_history
from run import run

PREVIOUS = "https://realdeals.proverifyfield.com/county-discovery.json"
PUBLIC_FIELDS = ("taxDeedId", "reportedBalance", "source", "reportDate", "parcelId")


def previous_sales():
    try:
        with urlopen(Request(PREVIOUS, headers={"User-Agent": "Mozilla/5.0 RealDealsPro"}), timeout=20) as response:
            return json.load(response).get("foreclosureSales", {})
    except Exception as error:
        print(f"Previous sale lists: {error}", file=sys.stderr)
        return {}


def osceola_report():
    try:
        report, rejected = osceola.live()
        if rejected:
            print(f"Osceola: excluded {len(rejected)} ambiguous rows", file=sys.stderr)
        return report
    except Exception as error:
        print(f"Osceola live report: {error}", file=sys.stderr)
        snapshot = Path(__file__).with_name("osceola-2026-11-24.json")
        return json.loads(snapshot.read_text(encoding="utf-8"))


def public_batch(batch):
    counties = {}
    sources = {**batch["counties"], "Osceola": osceola_report()}
    for county, result in sources.items():
        if result["status"] != "ok":
            print(f"{county}: {result['error']}", file=sys.stderr)
            if county != "Hillsborough":
                counties[county] = {"status": "error"}
                continue
            snapshot = Path(__file__).with_name("hillsborough-last-verified.json")
            result = {"status": "ok", "records": json.loads(snapshot.read_text(encoding="utf-8")), "stale": True}
        records = [
            {field: record[field] for field in PUBLIC_FIELDS if field in record}
            for record in result["records"]
        ]
        print(f"{county}: {len(records)} records", file=sys.stderr)
        counties[county] = {"status": "ok", "records": records}
        if result.get("stale"):
            counties[county]["stale"] = True
    if not any(result["status"] == "ok" and not result.get("stale") for result in counties.values()):
        raise RuntimeError("All county sources failed")
    return {"fetchedAt": batch["fetchedAt"], "counties": counties, "foreclosureSales": merge_sale_history(gather(foreclosure_sales()), previous_sales(), date.today())}


if __name__ == "__main__":
    print(json.dumps(public_batch(run()), indent=2))
