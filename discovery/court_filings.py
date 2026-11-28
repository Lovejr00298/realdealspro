"""New Hillsborough pre-foreclosure and probate filings from the clerk's public daily case-filing CSVs."""
from collections import Counter, defaultdict
import csv
from datetime import datetime
from io import StringIO
import re

from georgia import fetch

HILLS = "https://publicrec.hillsclerk.com"
CASE_SEARCH = "https://hover.hillsclerk.com/"
ESTATES = ("Formal Administration", "Summary Administration", "Disposition w/o Administration", "Ancillary Administration")
PLACEHOLDER = re.compile(r"UNKNOWN|TENANT|SPOUSE|OCCUPANT|POSSESSION|PARTIES|JOHN DOE|JANE DOE", re.I)
ESTATE = re.compile(r"ESTATE OF|HEIRS|DECEASED|BENEFICIAR|DEVISEE", re.I)
ADDRESS = re.compile(r"^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?$")


def clean(text):
    return " ".join((text or "").split())


def party(row):
    return clean(" ".join(row.get(k, "") for k in ("FirstName", "MiddleName", "LastName/CompanyName")))


def iso(text):
    try:
        return datetime.strptime(text.strip(), "%m/%d/%Y").date().isoformat()
    except ValueError:
        return ""


def address(text):
    """Split 'street, city, ST 12345' into parts; extra commas stay in the street."""
    match = ADDRESS.match(clean(text))
    return {"street": match[1], "city": match[2].title(), "state": match[3], "zip": match[4]} if match else None


def rows_by_case(text):
    cases = defaultdict(list)
    for row in csv.DictReader(StringIO(text.lstrip("\ufeff"))):
        cases[row["CaseNumber"].strip()].append(row)
    return cases


def foreclosure_kind(case_type):
    if "Partition" in case_type:
        return "Partition"
    if "Enforce Lien" in case_type or case_type.startswith("CC Real Property"):
        return "HOA or lien foreclosure"
    if "Foreclosure" in case_type:
        return "Commercial foreclosure" if "Commercial" in case_type else "Mortgage foreclosure"
    return ""


def most_common(addresses):
    found = [a for a in addresses if a and a["state"] == "FL"]
    if not found:
        return None
    key = Counter((a["street"].upper(), a["city"].upper(), a["zip"]) for a in found).most_common(1)[0][0]
    return next(a for a in found if (a["street"].upper(), a["city"].upper(), a["zip"]) == key)


def parse_civil(text, source):
    leads = []
    for case, rows in rows_by_case(text).items():
        case_type = clean(rows[0]["CaseTypeDescription"])
        kind = foreclosure_kind(case_type)
        if not kind:
            continue
        plaintiff = next((party(r) for r in rows if r["PartyType"] == "Plaintiff"), "")
        defendants = [r for r in rows if r["PartyType"] == "Defendant"]
        owners, seen = [], set()
        for r in defendants:
            name = party(r)
            if r.get("FirstName", "").strip() and not PLACEHOLDER.search(name) and name.upper() not in seen:
                seen.add(name.upper())
                owners.append(name)
        occupied = [address(r["PartyAddress"]) for r in defendants if PLACEHOLDER.search(party(r))]
        owned = [address(r["PartyAddress"]) for r in defendants if party(r) in owners]
        leads.append({
            "county": "Hillsborough", "caseNo": case, "filed": iso(rows[0]["FilingDate"]), "type": case_type, "kind": kind,
            "homestead": "Homestead" in case_type and "NonHomestead" not in case_type,
            "estate": any(ESTATE.search(party(r)) for r in defendants), "plaintiff": plaintiff,
            "owners": owners[:6], "property": most_common(occupied) or most_common(owned), "source": source,
        })
    return leads


def parse_probate(text, source):
    leads = []
    for case, rows in rows_by_case(text).items():
        case_type = clean(rows[0]["CaseTypeDescription"])
        decedent = next((r for r in rows if r["PartyType"] == "Decedent"), None)
        if not case_type.startswith(ESTATES) or not decedent:
            continue
        contacts, seen = [], set()
        for r in rows:
            role, name = r["PartyType"].strip(), party(r)
            if role in ("Petitioner", "Personal Representative", "Next of Kin", "Beneficiary") and name and (name.upper(), role) not in seen:
                seen.add((name.upper(), role))
                contacts.append({"role": role, "name": name, "address": address(r["PartyAddress"])})
        attorney = next((clean(r.get("Attorney")) for r in rows if clean(r.get("Attorney")) not in ("", "No Attorney")), "")
        leads.append({
            "county": "Hillsborough", "caseNo": case, "filed": iso(rows[0]["FilingDate"]), "type": case_type,
            "decedent": party(decedent), "died": iso(decedent.get("DateofDeath", "")),
            "property": address(decedent["PartyAddress"]), "contacts": contacts[:8], "attorney": attorney, "source": source,
        })
    return leads


def daily_files(folder, prefix, days):
    listing = fetch(f"{HILLS}/{folder}/dailyfilings/").decode("utf-8", errors="replace")
    names = sorted(set(re.findall(rf"{prefix}_\d{{8}}\.csv", listing)))[-days:]
    if not names:
        raise ValueError(f"No {prefix} files listed")
    return [f"{HILLS}/{folder}/dailyfilings/{name}" for name in names]


def gather_files(urls, parse):
    leads = {}
    for url in urls:
        for lead in parse(fetch(url).decode("utf-8-sig", errors="replace"), url):
            leads[lead["caseNo"]] = lead
    return sorted(leads.values(), key=lambda lead: (lead["filed"], lead["caseNo"]), reverse=True)


def hillsborough_filings(days=30):
    result = {}
    for kind, folder, prefix, parse in (("preforeclosure", "Civil", "CivilFiling", parse_civil),
                                        ("probate", "Probate", "ProbateFiling", parse_probate)):
        try:
            records = gather_files(daily_files(folder, prefix, days), parse)
            if not records:
                raise ValueError("no matching filings")
            result[kind] = {"status": "ok", "records": records, "caseSearch": CASE_SEARCH}
        except Exception as error:
            result[kind] = {"status": "error", "error": str(error)}
    return result


if __name__ == "__main__":
    import json
    data = hillsborough_filings()
    print(json.dumps({k: (v["status"], len(v.get("records", []))) for k, v in data.items()}))
