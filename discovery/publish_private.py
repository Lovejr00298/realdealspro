"""Encrypt named unclaimed-money lists so only accounts holding the private key in Supabase can read them."""
import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from clerk_lists import gather, unclaimed_lists

PUBLIC_KEY = Path(__file__).with_name("private_lists_public.pem")


def seal(payload, public_pem):
    key, iv = AESGCM.generate_key(256), os.urandom(12)
    data = AESGCM(key).encrypt(iv, json.dumps(payload).encode(), None)
    wrapped = serialization.load_pem_public_key(public_pem).encrypt(
        key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    encode = lambda raw: base64.b64encode(raw).decode()
    return {"alg": "RSA-OAEP-256+A256GCM", "key": encode(wrapped), "iv": encode(iv), "data": encode(data)}


if __name__ == "__main__":
    payload = {"fetchedAt": datetime.now(timezone.utc).isoformat(), "unclaimed": gather(unclaimed_lists())}
    print(json.dumps(seal(payload, PUBLIC_KEY.read_bytes())))
