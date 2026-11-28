import base64
import json
import unittest

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from clerk_lists import parse_bay_sales, parse_manatee_unclaimed, parse_osceola_sales, parse_volusia_unclaimed
from publish_private import seal


class ClerkListTests(unittest.TestCase):
    def test_osceola_sales_keep_plaintiff_only(self):
        text = "Party Name\n12/01/2026\n2016 CA 002797 MF\nWILMINGTON TRUST NATIONAL \nASSOCIATION\nvs.\nFORBES, NATHANIEL; et al\n"
        sale, = parse_osceola_sales(text)
        self.assertEqual((sale["caseNo"], sale["saleDate"], sale["plaintiff"]), ("2016 CA 002797 MF", "2026-12-01", "WILMINGTON TRUST NATIONAL ASSOCIATION"))
        self.assertNotIn("FORBES", json.dumps(sale))

    def test_bay_sales_skip_canceled(self):
        text = ("25000825CA\n \nSALE WILL BE HELD ONLINE @ \nwww.bay.realforeclose.com/index.cfm\n \n11-30-2026\n$118,392.32\n"
                "25001126CA SALE WILL BE HELD ONLINE ORDER CANCELLING SALE\n11-20-2026\n$475,097.40\n"
                "25001400CA\n123 MAIN ST PANAMA CITY\n12-01-2026\n$90,000.00\n")
        sales = parse_bay_sales(text)
        self.assertEqual([s["caseNo"] for s in sales], ["25000825CA", "25001400CA"])
        self.assertEqual((sales[0]["judgment"], sales[1]["address"]), (118392.32, "123 MAIN ST PANAMA CITY"))

    def test_unclaimed_rows(self):
        volusia = parse_volusia_unclaimed("AAMIR ISLAM                 153969            07/11/2024        POOLED CASH          177.00\n")
        self.assertEqual((volusia[0]["name"], volusia[0]["amount"], volusia[0]["date"]), ("AAMIR ISLAM", 177.0, "2024-07-11"))
        manatee = parse_manatee_unclaimed("ADAMS, STEPHEN $1,000.0 0 2024MM002573AX\nABIGAIL BOCK $15.00 JURY SERVICE\n")
        self.assertEqual([(r["name"], r["amount"]) for r in manatee], [("ADAMS, STEPHEN", 1000.0), ("ABIGAIL BOCK", 15.0)])

    def test_sealed_payload_opens_with_private_key(self):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        sealed = seal({"names": ["A"]}, key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
        self.assertNotIn("names", json.dumps(sealed))
        aes = key.decrypt(base64.b64decode(sealed["key"]), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
        opened = AESGCM(aes).decrypt(base64.b64decode(sealed["iv"]), base64.b64decode(sealed["data"]), None)
        self.assertEqual(json.loads(opened), {"names": ["A"]})


if __name__ == "__main__":
    unittest.main()
