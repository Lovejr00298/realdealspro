import unittest

from georgia import parse_cobb, parse_dekalb, parse_gwinnett


class GeorgiaParsers(unittest.TestCase):
    def test_dekalb(self):
        text = "EXCESS FUNDS\nAs of 11/10/2026\nPARCEL ID EXCESS AMOUNT SALEDATE\n06 307 01 032 $2,107.70 5/2/2023 THOMAS MORGAN 5264 ARRIE WAY ATLANTA 30360\n15 036 01 183 $145,043.00 10/6/2026 BABY NORMAN 3746 BROOKSIDE PKWY DECATUR 30034\nPage 1"
        rows = parse_dekalb(text)
        self.assertEqual([r["taxDeedId"] for r in rows], ["06 307 01 032", "15 036 01 183"])
        self.assertEqual(rows[1]["reportedBalance"], 145043.00)
        self.assertEqual(rows[0]["reportDate"], "2026-11-10")
        self.assertEqual(rows[0]["saleDate"], "2023-05-02")

    def test_gwinnett(self):
        text = "Updated 11/23/2026\nNAME OF BUYER PARCEL NUMBER OWNER SITUS EXCESS FUNDS TAX SALE\nVERNON EDMUND SHAW R3003 683 ST MORIAH LLC BOULDER STONE WAY $3,603.94 August 2021\nR & P ENTERPRISES GROUP LLC R4348A061 MARY FITZGERALD WALLACE CIR $5,157.61 August 2021\nMV EVERGREEN HOMES CO R5152 135 BP DIVERSIFIED ASSETS GROUP 259 BRACKIN TRACE $25.00 August 2025"
        rows = parse_gwinnett(text)
        self.assertEqual([r["parcelId"] for r in rows], ["R3003 683", "R4348A061", "R5152 135"])
        self.assertEqual(rows[1]["reportedBalance"], 5157.61)
        self.assertEqual(rows[0]["reportDate"], "2026-11-23")

    def test_cobb(self):
        text = "Date of Sale Purchaser Owner Parcel ID Excess Funds Pending\nClaim\n9/1/2020 S & S LEGACY PROPERTIES, LLC BMW HOMES INC 20-0077-0-038-0 $11,676.19 Yes\n10/5/2021 HENRY, SHARON HASTY, B N AKA HASTY, BOBBY N A/K/A HAS19-0928-0-074-0 $32,508.71 Yes\n11/4/2025 RENALDO TOZZO WATSON, CAMERON WILEY 16-0375-0-035-0 $4,915.95 No\nExcess Funds\n11/3/2026\n"
        rows = parse_cobb(text)
        self.assertEqual([r["parcelId"] for r in rows], ["20-0077-0-038-0", "19-0928-0-074-0", "16-0375-0-035-0"])
        self.assertEqual([r["pendingClaim"] for r in rows], [True, True, False])
        self.assertEqual(rows[0]["reportDate"], "2026-11-03")


if __name__ == "__main__":
    unittest.main()
