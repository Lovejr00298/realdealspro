"""Encrypt named unclaimed-money lists and surplus former-owner names so only accounts holding the private key in Supabase can read them."""
import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from clerk_lists import gather, unclaimed_lists
from court_filings import hillsborough_filings
from georgia import fetch
from marion_private import names_by_sale

PUBLIC_KEY = Path(__file__).with_name("private_lists_public.pem")


def seal(payload, public_pem):
    key, iv = AESGCM.generate_key(256), os.urandom(12)
    data = AESGCM(key).encrypt(iv, json.dumps(payload).encode(), None)
    wrapped = serialization.load_pem_public_key(public_pem).encrypt(
        key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    encode = lambda raw: base64.b64encode(raw).decode()
    return {"alg": "RSA-OAEP-256+A256GCM", "key": encode(wrapped), "iv": encode(iv), "data": encode(data)}


def surplus_names(batch):
    names = {}
    for county, result in batch["counties"].items():
        if result.get("status") != "ok":
            continue
        found = {r["taxDeedId"]: r.get("formerOwner") or r.get("formerOwnerAndSitus") for r in result["records"]}
        found = {deed: name for deed, name in found.items() if name}
        if found:
            names[county] = found
    return names


def marion_names(records):
    pdf = fetch(records[0]["source"])
    text = subprocess.run(["pdftotext", "-layout", "-", "-"], input=pdf, capture_output=True, check=True, timeout=60).stdout.decode()
    found = names_by_sale(text)
    return {r["taxDeedId"]: next(iter(found[(r["taxDeedId"], r["parcelId"])]))
            for r in records if len(found.get((r["taxDeedId"], r["parcelId"]), ())) == 1}


def all_surplus_names():
    from run import run
    batch = run()
    failed = [county for county, result in batch["counties"].items() if result["status"] != "ok"]
    for county in failed:
        print(f"{county} names: {batch['counties'][county]['error']}", file=sys.stderr)
    if failed:
        batch["counties"].update(run(failed)["counties"])
    names = surplus_names(batch)
    marion = batch["counties"].get("Marion", {})
    if marion.get("status") == "ok" and marion["records"]:
        try:
            names["Marion"] = marion_names(marion["records"])
        except Exception as error:
            print(f"Marion names: {error}", file=sys.stderr)
    return names


if __name__ == "__main__":
    payload = {"fetchedAt": datetime.now(timezone.utc).isoformat(), "unclaimed": gather(unclaimed_lists()),
               "surplusNames": all_surplus_names(), "filings": {"Hillsborough": hillsborough_filings()}}
    print(json.dumps(seal(payload, PUBLIC_KEY.read_bytes())))
