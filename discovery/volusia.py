"""Read the Volusia County Clerk tax deed surplus list into source-linked review candidates."""
from datetime import datetime
import re

from georgia import fetch, money, pdf_text

VOLUSIA = "https://www.clerk.org/pdf/user_publish/TaxDeeds/Tax_Deed_Surplus_List.pdf"
NUMBER = r"[\d,]+\.\d{2}"


def parse_volusia(text, source=VOLUSIA):
    dated = re.search(r"680-2089008\s+(\d{1,2}/\d{1,2}/\d{4})", text)
    report = datetime.strptime(dated[1], "%m/%d/%Y").date().isoformat() if dated else None
    records = []
    for chunk in re.split(r"^(?=\d{1,2}/\d{1,2}/\d{4}\b)", text, flags=re.M)[1:]:
        found = re.match(r"(\d{1,2}/\d{1,2}/\d{4})\s+(.+?)\s+(\d{1,6}-\d{2})\s+(?:\$\s*)?(" + NUMBER + r")(.*)", chunk, re.S)
        if not found:
            continue
        received, owner, cert, deposit, rest = found.groups()
        columns = re.findall(r"(?<![\d/])(?:" + NUMBER + r"|-)(?![\d/])", rest.split("\n")[0])
        balance = money(columns[-1]) if len(columns) >= 4 and columns[-1] != "-" else 0
        if balance <= 0:
            continue
        records.append({"county": "Volusia", "taxDeedId": cert, "certificate": cert, "reportedBalance": balance,
                        "deposit": money(deposit), "surplusReceived": datetime.strptime(received, "%m/%d/%Y").date().isoformat(),
                        "formerOwner": " ".join(owner.split()), "reportDate": report, "source": source})
    return records


def fetch_volusia():
    return parse_volusia(pdf_text(fetch(VOLUSIA)))
