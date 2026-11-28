import unittest
from unittest import mock

from georgia import parse_chatham, parse_clayton
from volusia import parse_volusia
import osceola


class CountyParsers(unittest.TestCase):
    def test_osceola_live_report_is_current(self):
        text = """Tax Deeds Surplus Funds Available
Report Date:             11/27/2026 7:55:04 AM
 11/10/2026
                  155-2026           6032024            $20,754.50                         032528340700014223
"""
        with mock.patch("georgia.fetch", return_value=b"%PDF"), mock.patch("clerk_lists.layout_text", return_value=text):
            report, rejected = osceola.live()
        self.assertEqual(rejected, [])
        self.assertFalse(report["stale"])
        self.assertEqual(report["records"], [{"taxDeedId": "155-2026", "reportedBalance": 20754.5, "reportDate": "2026-11-27",
                                              "parcelId": "032528340700014223", "source": osceola.REPORT}])

    def test_clayton(self):
        text = "EXCESS FUNDS LISTING\nJUNE 2026\nWILLIAMS, DEVON 05213 214013 A07 44,134.74$              11/05/24\nC&S REALTY SOLUTIONS LLC 05247D  F005 3,107.06$                10/05/21\nZERO OWNER 05015 017010 0.00$ 02/02/21"
        rows = parse_clayton(text)
        self.assertEqual([r["parcelId"] for r in rows], ["05213 214013 A07", "05247D F005"])
        self.assertEqual(rows[0]["reportedBalance"], 44134.74)
        self.assertEqual(rows[1]["saleDate"], "2021-10-05")
        self.assertEqual(rows[1]["formerOwner"], "C&S REALTY SOLUTIONS LLC")

    def test_chatham(self):
        text = ("Excess Funds as of October 31, 2026 \nPIN File Name Sale Date Bidder Remaining Balance\n"
                "10046 03008 HOLSHOUSER CLARENCE V\n5/4/2021\nFREDERICK D MANER JR\n$18,265.70\n"
                "10127 01037 IN REM AGAINST THE PROPERTY KNOWN AS LOT 150 GRAYS SUB, SAID \nPROPERTY BEING FORMERLY IN THE NAME OF ROACH REALTY COMPANY INC. 10/3/2023\nDENNIS GRAYSON\n$8,482.84\n")
        rows = parse_chatham(text)
        self.assertEqual([r["parcelId"] for r in rows], ["10046 03008", "10127 01037"])
        self.assertEqual(rows[1]["reportedBalance"], 8482.84)
        self.assertEqual(rows[1]["bidder"], "DENNIS GRAYSON")
        self.assertTrue(rows[1]["formerOwner"].endswith("ROACH REALTY COMPANY INC."))
        self.assertEqual(rows[0]["reportDate"], "2026-10-31")

    def test_volusia(self):
        text = ("680-2089008 10/31/2026 3,950,328.46\n"
                "7/12/2023 PATRICK MONROE STEPHENS 6912-20  $           145,004.21 2,182.56        142,821.65           91,622.99         X 51,198.66                  12/31/2024\n"
                "5/9/2024\nROBERT FUKAL/ESTATE OF BETTY FUKAL AKA BETTY BLANCHE \nFUKAL 5530-18  $                1,246.19 26.19              1,220.00                570.00               X 650.00                        12/31/2025\n"
                "3/30/2026 FREDERIC C WHITE 5167-22  $                1,750.00 33.75              1,716.25                -                      1,716.25\n"
                "2/4/2026 DOMENIC RUCCO 9029-23  $                8,931.38 141.47           8,789.91                8,789.91           -\n")
        rows = parse_volusia(text)
        self.assertEqual([r["certificate"] for r in rows], ["6912-20", "5530-18", "5167-22"])
        self.assertEqual([r["reportedBalance"] for r in rows], [51198.66, 650.00, 1716.25])
        self.assertTrue(rows[1]["formerOwner"].endswith("BETTY BLANCHE FUKAL"))
        self.assertEqual(rows[0]["reportDate"], "2026-10-31")


if __name__ == "__main__":
    unittest.main()
