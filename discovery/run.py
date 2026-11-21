"""Fetch clerk reports and write one review batch to standard output."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import sys

from hillsborough import fetch_candidates
from pasco import fetch_latest
from marion import fetch_marion


def run():
    sources = {"Pasco": fetch_latest, "Hillsborough": fetch_candidates, "Marion": fetch_marion}
    results = {}
    with ThreadPoolExecutor(max_workers=len(sources)) as pool:
        jobs = {county: pool.submit(fetch) for county, fetch in sources.items()}
        for county, job in jobs.items():
            try:
                results[county] = {"status": "ok", "records": job.result()}
            except Exception as error:
                results[county] = {"status": "error", "error": str(error)}
    return {"fetchedAt": datetime.now(timezone.utc).isoformat(), "counties": results}


if __name__ == "__main__":
    batch = run()
    print(json.dumps(batch, indent=2))
    sys.exit(any(result["status"] == "error" for result in batch["counties"].values()))
