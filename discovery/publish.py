"""Generate the public county queue without names or internal error details."""
import json
import sys

from run import run

PUBLIC_FIELDS = ("taxDeedId", "reportedBalance", "source", "reportDate", "parcelId")


def public_batch(batch):
    counties = {}
    for county, result in batch["counties"].items():
        if result["status"] != "ok":
            print(f"{county}: {result['error']}", file=sys.stderr)
            counties[county] = {"status": "error"}
            continue
        records = [
            {field: record[field] for field in PUBLIC_FIELDS if field in record}
            for record in result["records"]
        ]
        print(f"{county}: {len(records)} records", file=sys.stderr)
        counties[county] = {"status": "ok", "records": records}
    if not any(result["status"] == "ok" for result in counties.values()):
        raise RuntimeError("All county sources failed")
    return {"fetchedAt": batch["fetchedAt"], "counties": counties}


if __name__ == "__main__":
    print(json.dumps(public_batch(run()), indent=2))
