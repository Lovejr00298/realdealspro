"""Generate the public county queue without names or internal error details."""
import json
from pathlib import Path
import sys

from run import run

PUBLIC_FIELDS = ("taxDeedId", "reportedBalance", "source", "reportDate", "parcelId")


def public_batch(batch):
    counties = {}
    snapshot = Path(__file__).with_name("osceola-2026-11-23.json")
    sources = {**batch["counties"], "Osceola": json.loads(snapshot.read_text(encoding="utf-8"))}
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
    return {"fetchedAt": batch["fetchedAt"], "counties": counties}


if __name__ == "__main__":
    print(json.dumps(public_batch(run()), indent=2))
