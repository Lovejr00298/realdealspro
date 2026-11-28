import base64
import json
import unittest

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from datetime import date
from clerk_lists import merge_sale_history, parse_bay_sales, parse_manatee_unclaimed, parse_osceola_sales, parse_volusia_unclaimed
from publish_private import seal
from court_filings import parse_civil, parse_probate


class ClerkListTests(unittest.TestCase):
    def test_osceola_sales_keep_plaintiff_only(self):
        text = "Party Name\n12/01/2026\n2016 CA 002797 MF\nWILMINGTON TRUST NATIONAL \nASSOCIATION\nvs.\nFORBES, NATHANIEL; et al\n"
        sale, = parse_osceola_sales(text)
        self.assertEqual((sale["caseNo"], sale["saleDate"], sale["plaintiff"]), ("2016 CA 002797 MF", "2026-12-01", "WILMINGTON TRUST NATIONAL ASSOCIATION"))
        self.assertNotIn("FORBES", json.dumps(sale))

    def test_bay_sales_flag_canceled(self):
        text = ("25000825CA\n \nSALE WILL BE HELD ONLINE @ \nwww.bay.realforeclose.com/index.cfm\n \n11-30-2026\n$118,392.32\n"
                "25001126CA\nORDER CANCELLING SALE\n11-20-2026\n$475,097.40\n"
                "25001400CA\n123 MAIN ST PANAMA CITY\n12-01-2026\n$90,000.00\n")
        sales = parse_bay_sales(text)
        self.assertEqual([(s["caseNo"], s.get("canceled", False)) for s in sales],
                         [("25000825CA", False), ("25001126CA", True), ("25001400CA", False)])
        self.assertEqual((sales[0]["judgment"], sales[1]["address"], sales[2]["address"]), (118392.32, "", "123 MAIN ST PANAMA CITY"))

    def test_sale_history_keeps_passed_sales(self):
        previous = {"Bay": {"status": "ok", "records": [
            {"caseNo": "A", "saleDate": "2026-11-20"}, {"caseNo": "B", "saleDate": "2026-12-15"},
            {"caseNo": "C", "saleDate": "2026-11-21", "canceled": True}, {"caseNo": "D", "saleDate": "2026-01-01"},
            {"caseNo": "E", "saleDate": "2026-12-01"}]}}
        current = {"Bay": {"status": "ok", "records": [{"caseNo": "E", "saleDate": "2026-12-08"}]},
                   "Osceola": {"status": "error"}}
        merged = merge_sale_history(current, previous, date(2026, 11, 28))
        self.assertEqual([(r["caseNo"], r.get("dropped", False)) for r in merged["Bay"]["records"]], [("E", False), ("A", True)])
        self.assertEqual(merged["Osceola"], {"status": "error"})
        stale = merge_sale_history({"Bay": {"status": "error"}}, previous, date(2026, 11, 28))["Bay"]
        self.assertTrue(stale["stale"])
        self.assertEqual(len(stale["records"]), 4)

    def test_surplus_names_from_batch(self):
        from publish_private import surplus_names
        batch = {"counties": {"Pasco": {"status": "ok", "records": [{"taxDeedId": "1", "formerOwner": "DOE JOHN"}, {"taxDeedId": "2", "formerOwner": ""}]},
                              "DeKalb, GA": {"status": "ok", "records": [{"taxDeedId": "3", "formerOwnerAndSitus": "SMITH ANN 1 MAIN ST"}]},
                              "Cobb, GA": {"status": "error"}}}
        self.assertEqual(surplus_names(batch), {"Pasco": {"1": "DOE JOHN"}, "DeKalb, GA": {"3": "SMITH ANN 1 MAIN ST"}})

    def test_unclaimed_rows(self):
        volusia = parse_volusia_unclaimed("AAMIR ISLAM                 153969            07/11/2024        POOLED CASH          177.00\n")
        self.assertEqual((volusia[0]["name"], volusia[0]["amount"], volusia[0]["date"]), ("AAMIR ISLAM", 177.0, "2024-07-11"))
        manatee = parse_manatee_unclaimed("ADAMS, STEPHEN $1,000.0 0 2024MM002573AX\nABIGAIL BOCK $15.00 JURY SERVICE\n")
        self.assertEqual([(r["name"], r["amount"]) for r in manatee], [("ADAMS, STEPHEN", 1000.0), ("ABIGAIL BOCK", 15.0)])

    def test_civil_filings_keep_foreclosures_with_owner_and_property(self):
        head = 'CaseCategory,CaseTypeDescription,CaseNumber,Title,FilingDate,PartyType,FirstName,MiddleName,LastName/CompanyName,PartyAddress,Attorney\n'
        rows = ['"CV","Mortgage Foreclosure - Homestead -3- $250,000 or More","26-CA-1","BANK vs DOE","11/25/2026","Plaintiff","","","MIDFIRST BANK","401 W Linton Blvd, Delray Beach, FL 33444","No Attorney"',
                '"CV","Mortgage Foreclosure - Homestead -3- $250,000 or More","26-CA-1","BANK vs DOE","11/25/2026","Defendant","Jane","Q","Doe","PO Box 9, Tampa, FL 33601","No Attorney"',
                '"CV","Mortgage Foreclosure - Homestead -3- $250,000 or More","26-CA-1","BANK vs DOE","11/25/2026","Defendant","","","UNKNOWN SPOUSE OF JANE DOE","5108 N 21st St, Tampa, FL 33610","No Attorney"',
                '"CV","Mortgage Foreclosure - Homestead -3- $250,000 or More","26-CA-1","BANK vs DOE","11/25/2026","Defendant","","","UNKNOWN TENANT #1","5108 N 21st St, Tampa, FL 33610","No Attorney"',
                '"CV","CC Debt Owed $8,000.01 to  $15,000.00","26-CC-2","A vs B","11/25/2026","Defendant","Bob","","Smith","1 Main St, Tampa, FL 33602","No Attorney"',
                '"CV","CC Enforce Lien $0.00 to  $15,000.00","26-CC-3","HOA vs C","11/25/2026","Defendant","Cal","","Estate of Lee","9 Elm St, Brandon, FL 33511","No Attorney"']
        leads = parse_civil(head + "\n".join(rows), "src")
        self.assertEqual([l["caseNo"] for l in leads], ["26-CA-1", "26-CC-3"])
        first, lien = leads
        self.assertEqual((first["owners"], first["plaintiff"], first["homestead"], first["filed"]), (["Jane Q Doe"], "MIDFIRST BANK", True, "2026-11-25"))
        self.assertEqual(first["property"], {"street": "5108 N 21st St", "city": "Tampa", "state": "FL", "zip": "33610"})
        self.assertEqual((lien["kind"], lien["estate"]), ("HOA or lien foreclosure", True))

    def test_probate_filings_keep_estates_with_decedent_and_contacts(self):
        head = 'CaseCategory,CaseTypeDescription,CaseNumber,Title,FilingDate,PartyType,FirstName,MiddleName,LastName/CompanyName,DateofDeath,PartyAddress,Attorney\n'
        rows = ['"PR","Formal Administration","26-CP-1","DOE - Estate","11/23/2026","Petitioner","SAM","","DOE","","1 Oak Ave, Riverview, FL 33579","ANN LAW "',
                '"PR","Formal Administration","26-CP-1","DOE - Estate","11/23/2026","Decedent","PAT","","DOE","12/23/2025","7 Pine St, Tampa, FL 33607","No Attorney"',
                '"PR","Pre - Need Guardianship","26-CP-2","X","11/23/2026","Ward","AL","","X","","2 Bay St, Tampa, FL 33602","No Attorney"']
        lead, = parse_probate(head + "\n".join(rows), "src")
        self.assertEqual((lead["decedent"], lead["died"], lead["property"]["street"], lead["attorney"]), ("PAT DOE", "2025-12-23", "7 Pine St", "ANN LAW"))
        self.assertEqual(lead["contacts"], [{"role": "Petitioner", "name": "SAM DOE", "address": {"street": "1 Oak Ave", "city": "Riverview", "state": "FL", "zip": "33579"}}])

    def test_sealed_payload_opens_with_private_key(self):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        sealed = seal({"names": ["A"]}, key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
        self.assertNotIn("names", json.dumps(sealed))
        aes = key.decrypt(base64.b64decode(sealed["key"]), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
        opened = AESGCM(aes).decrypt(base64.b64decode(sealed["iv"]), base64.b64decode(sealed["data"]), None)
        self.assertEqual(json.loads(opened), {"names": ["A"]})


if __name__ == "__main__":
    unittest.main()
