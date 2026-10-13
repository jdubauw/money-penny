#!/usr/bin/env python3
import json
import re
import subprocess
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "input"
OUT = ROOT / "work"

TX_RE = re.compile(r"^\s*(\d{2}/\d{2})\s+(.*?)\s+(-?(?:\d{1,3}(?:,\d{3})*|\d*)\.\d{2})\s*$")
OPEN_CLOSE_RE = re.compile(r"Opening/Closing Date\s+(\d{2}/\d{2}/\d{2})\s+-\s+(\d{2}/\d{2}/\d{2})")
SUMMARY_PATTERNS = {
    "previous_balance": re.compile(r"Previous Balance\s+\$([\d,]+\.\d{2})"),
    "payments_credits": re.compile(r"Payment, Credits\s+-\$([\d,]+\.\d{2})"),
    "purchases": re.compile(r"Purchases\s+\+\$([\d,]+\.\d{2})"),
    "fees": re.compile(r"Fees Charged\s+\$?([\d,]+\.\d{2})"),
    "interest": re.compile(r"Interest Charged\s+\$?([\d,]+\.\d{2})"),
    "new_balance": re.compile(r"New Balance\s+\$([\d,]+\.\d{2})"),
}

DINING = [
    "TAQUERIA", "RESTAURANT", "CHICK-FIL", "PEPPERON", "EL TIEMPO", "PHO ", "GRINGO", "LOCAL TABLE",
    "WHATABURGER", "TECATE", "SALATA", "RAMEN", "JERSEY MIKE", "VIENGTHAI", "DISH SOCIETY", "BURGER",
    "POKEWORKS", "MALA SICHUAN", "HUGHIES", "VELVET TACO", "JACK IN THE BOX", "BREWINGZ", "TACO",
    "MCDONALD", "STARBUCKS", "DUNKIN", "SUBWAY", "PIZZA", "SUSHI", "CAFE", "COFFEE", "BAKERY",
    "KITCHEN", "CANTINA", "GRILL", "BISTRO", "DINER", "EATERY", "WING", "BBQ", "BAR &", "RSTBAR",
    "DOORDASH", "UBER EATS", "UBEREATS", "GRUBHUB", "TST*", "SQ *", "TOAST*", "NOTHING BUNDT",
    "CAVATORE", "JONATHANS THE RUB", "TEOTIHUACAN", "TEXAS ROADHOUSE", "CRACKER BARREL", "SHIKI-SAI",
    "PADDLEFISH", "PRIME 131", "LUPE TORTILLA", "GRAND OLD HOUSE", "MORGAN'S HAR", "TORTUGA AIRPORT",
    "MS. PIPER", "BBC OPCO", "ROCKET FIZZ", "CORNER STORE",
    "UCHI", "CAVA", "YOURCUISINECHEF", "LANDRYS", "GRACIES", "LUPETORTILLA", "LUPE TORTILLA",
    "CARRABBAS", "STATE OF GRACE", "BOARDERIE", "LIQUOR", "SPECS #", "SHIPLEY", "SPANISH FLOWERS", "LAURENZOS", "LA CARRETA", "DAKOTA RESERVATION", "SAUSAGE",
]
GROCERY = ["H-E-B", "HEB ", "KROGER", "WHOLEFDS", "WHOLE FOODS", "TRADER JOE", "ALDI", "SPROUTS", "GROCERY", "COSTCO", "SAM'S CLUB", "THRIVE MARKET"]
TRAVEL = ["AIRLINES", "AIRLINE", "UNITED ", "SOUTHWEST", "DELTA ", "AMERICAN AIR", "MARRIOTT", "HILTON", "HYATT", "HOTEL", "AIRBNB", "VRBO", "WDW TICKETS", "EXPEDIA", "HERTZ", "AVIS", "UBER ", "LYFT ", "KALAHARI RESORT", "RITZ-CARLTON", "LE MERIDIEN", "PASSPORT", "VONLANE"]
ENTERTAINMENT = ["FANDANGO", "CINEMARK", "AMC ", "BOTANIC GARDEN", "DEL MAR LANES", "MAX.COM", "YOUTUBE TV", "NETFLIX", "HULU", "SPOTIFY", "TICKETMASTER", "WDW LIGHTNING", "DROID DEPOT", "HOUSTON TEXANS", "HOUSTONARBORETUM"]
HOME = ["LOWES", "HOME DEPOT", "SHERWIN", "PESTIE", "ORKIN", "SUR LA TABLE", "WORLD MARKET", "THE DUMP", "IKEA", "WAYFAIR", "FURNITURE", "MATTRESS", "WESTELM", "KIRKLAND'S", "HEXCLAD"]
PETS = ["MOLLYS MUTT", "CHEWY", "VETERI", "PETCO", "PETSMART", "VET "]
KIDS = ["LITTLE GYM", "BIRONS YOUTH", "YOUTH SPORTS", "DAYCARE", "SCHOOL", "CHILD", "MUSTANG CHEER", "MUSTANG CHE", "KIDCREATE", "HOUSTON BALLET", "POWERPACKED SWIMMING", "SCHOLASTIC", "IXL FAMILY", "STPIUSX", "MUSTANG SPIRIT", "FLYNNOHARA", "JUST BETWEEN FRIENDS", "CAMP OTX", "DADS CLUB SWIM", "THE ARTZ", "ICP*RISE", "& RISE", "RISE ", "EVRTHG SUMMERCAMP", "PHOTODAY", "CCISD CULINARY", "POPSICLEDASH", "LEMONADEDASH", "MYBOOSTER", "ST MARK LUT"]
PERSONAL = ["ULTA", "SALLY BEAUTY", "NAIL ", "SPORT CLIPS", "SALON", "BARBER", "SEPHORA", "SPA ", "VAGARO", "JENTRY KELLEY", "TOP THAI MASSAGE"]
SHOPPING = ["AMAZON", "TARGET", "TJMAXX", "T J MAXX", "T.J. MAXX", "MARSHALLS", "NORDSTROM", "DOLLAR TREE", "HOBBY-LOBBY", "HOBBY LOBBY", "CANAKIT", "SIG SAUER", "NESPRESSO", "SHARKNINJA", "DICKS SPORTING", "WAL-MART", "WALMART", "WM SUPERCENTER", "MADEWELL", "STANLEY", "SHEIN", "ETSY", "LULULEMON", "MACYS", "KOHLS", "KOHL'S", "MILAANDROSE", "FAMOUS FOOTWEAR", "MICHAELS", "LOLA THE BOYS", "JADELYNNBROOKE", "FANATICS", "MINI MAHJER", "DONDOLO", "ON INC", "COOKWARE", "J CREW", "FLEET FEET", "VICTORIAS SECRET", "NORDSTICK", "ATHLETA", "OLD NAVY", "VUORI", "HOKA", "DECKERS", "STATE BAGS", "SUNSHINE TIENDA", "ARNE'S"]
BUSINESS = ["TWILIO", "AMAZON WEB SERVICES", "GOOGLE *PUSHOVER", "MICROSOFT", "ADOBE", "GITHUB", "DIGITALOCEAN"]
HEALTH = ["PHARMACY", "CVS", "WALGREENS", "HOSPITAL", "CLINIC", "DENTAL", "MEDICAL", "DOCTOR", "BCRN AESTHETICS", "DERMATOLOGY", "EYE TO EYE", "HIMS AND HERS", "MYCHART", "UTHEALTH", "WHOOP", "STRAVA"]
AUTO = ["SHELL ", "EXXON", "CHEVRON", "VALERO", "MURPHY", "CONOCO", "FUEL", "GAS ", "TIRE", "AUTOZONE", "CAR WASH", "PARKING", "TOLL", "BRAKE CHECK", "TAKE 5"]
PROFESSIONAL = ["CONATIVE GROUP", "TRUST & WILL", "MGA, LLP", "AIWYN.AI"]
GIVING = ["CHURCH", "DONORSCHOOSE", "HOUSTONSFIRSTBAPTIST", "ST MARK LUTHERAN", "ST. MARK LUTHERAN", "STMARKLUTH", "HOUSTON SPCA"]
GOVERNMENT = ["OFFICIAL PAYMENTS"]

CANONICAL_VENDORS = [
    ("YOUTUBEPREMIUM", "YouTube Premium"), ("YOUTUBE TV", "YouTube TV"), ("NETFLIX", "Netflix"),
    ("HLU*HULUPLUS", "Hulu"), ("HULU", "Hulu"), ("SPOTIFY", "Spotify"),
    ("GOOGLE ONE", "Google One"), ("GOOGLE NEST", "Google Nest"), ("STRAVA", "Strava"),
    ("IXL FAMILY", "IXL"), ("FLOSPORTS", "FloSports"), ("PROTON AG", "Proton"),
    ("CLOUDFLARE", "Cloudflare"), ("GOOGLE *FI", "Google Fi"), ("& GOOGLE *FI", "Google Fi"),
    ("CANAKIT", "CanaKit"), ("SHEIN", "SHEIN"), ("WAYFAIR", "Wayfair"), ("JCPENNEY", "JCPenney"),
    ("DONORSCHOOSE", "DonorsChoose"), ("SEISMIQUE", "Seismique"), ("STPIUSX", "St. Pius X"),
    ("AMAZON WEB SERVICES", "Amazon Web Services"), ("AMAZON PRIME", "Amazon Prime"), ("AMAZON MKTPL", "Amazon"), ("AMZN", "Amazon"), ("AMAZON.COM", "Amazon"),
    ("H-E-B", "H-E-B"), ("WHOLEFDS", "Whole Foods Market"), ("WHOLE FOODS", "Whole Foods Market"), ("KROGER", "Kroger"),
    ("COSTCO", "Costco"), ("WAL-MART", "Walmart"), ("WALMART", "Walmart"), ("TARGET", "Target"),
    ("TJMAXX", "TJ Maxx"), ("T J MAXX", "TJ Maxx"), ("T.J. MAXX", "TJ Maxx"), ("MARSHALLS", "Marshalls"),
    ("NORDSTROM", "Nordstrom"), ("MACYS", "Macy's"), ("KOHLS", "Kohl's"), ("DICKS SPORTING", "Dick's Sporting Goods"),
    ("LOWES", "Lowe's"), ("HOME DEPOT", "Home Depot"), ("SHERWIN", "Sherwin-Williams"), ("WORLD MARKET", "World Market"),
    ("SUR LA TABLE", "Sur La Table"), ("THE DUMP", "The Dump"), ("MATTRESS MAKERS", "Texas Mattress Makers"),
    ("RITZ-CARLTON", "Ritz-Carlton"), ("LE MERIDIEN", "Le Meridien"), ("KALAHARI", "Kalahari Resort"),
    ("WDW ", "Walt Disney World"), ("WALT DISNEY W", "Walt Disney World"),
    ("MOLLYS MUTT", "Molly's Mutt House"), ("WASHINGTON HEIGHTS VETERI", "Washington Heights Veterinary Clinic"), ("CHEWY", "Chewy"),
    ("BIRONS YOUTH", "Birons Youth Sports"), ("LITTLE GYM", "The Little Gym"), ("MUSTANG CHEER", "Mustang Cheer"),
    ("ULTA", "Ulta Beauty"), ("SALLY BEAUTY", "Sally Beauty"), ("SPORT CLIPS", "Sport Clips"), ("VAGARO", "Shade the Salon"),
    ("CHICK-FIL", "Chick-fil-A"), ("WHATABURGER", "Whataburger"), ("JACK IN THE BOX", "Jack in the Box"),
    ("TECATE MEXICAN", "Tecate Mexican Restaurant"), ("PHO FIX", "Pho Fix"), ("PHO BEN", "Pho Ben"),
    ("TEOTIHUACAN", "Teotihuacan Mexican Cafe"), ("NOTHING BUNDT", "Nothing Bundt Cakes"),
    ("JERSEY MIKE", "Jersey Mike's"), ("VELVET TACO", "Velvet Taco"), ("LUPE TORTILLA", "Lupe Tortilla"),
    ("GRINGO'S", "Gringo's Mexican Kitchen"), ("LOCAL TABLE", "Local Table"), ("EL TIEMPO", "El Tiempo Cantina"),
    ("TWILIO", "Twilio"), ("YOUTUBE TV", "YouTube TV"), ("MAX.COM", "Max"), ("PESTIE", "Pestie"), ("ORKIN", "Orkin"),
    ("THE CONATIVE GROUP", "The Conative Group"), ("TRUST & WILL", "Trust & Will"), ("MGA, LLP", "MGA LLP"),
]

def normalize_vendor(description):
    d = re.sub(r"\s+", " ", description.upper()).strip()
    for needle, vendor in CANONICAL_VENDORS:
        if needle in d:
            return vendor
    d = re.sub(r"^(TST\*|SQ \*|SP |JFI\*|ICP\*|IN \*|PAY\*|PYMT\*|FRG\*)\s*", "", d)
    d = re.sub(r"\b(?:HTTPS?\S+|WWW\.\S+|\S+\.COM\S*|\d{3}-\d{3,7}|\d{3}-\d{3}-\d{4}|\d{7,})\b", "", d)
    d = re.sub(r"\s+#?\d{3,}\b.*$", "", d)
    d = re.sub(r"\s+(?:HOUSTON|DALLAS|AUSTIN|ROUND ROCK|LAKE BUENA VI|GEORGE TOWN|WILMINGTON|SAN FRANCISCO|NEW YORK)\b.*$", "", d)
    d = re.sub(r"\s+(?:TX|CA|FL|NY|WA|IL|GA|OR|UT|DE|NJ|MA|NC|PA|AR|OH|KS|IN|NH)\s*$", "", d)
    d = re.sub(r"\s+", " ", d).strip(" -*#")
    words = d.split()
    if len(words) > 6:
        d = " ".join(words[:6])
    return d.title() if d else "Unknown Vendor"

def any_in(text, terms):
    return any(term in text for term in terms)

def categorize(description, tx_type):
    d = re.sub(r"^&\s*", "", description.upper())
    if tx_type != "Purchase":
        return "Payments & Credits", "Payment/Credit"
    if any_in(d, GROCERY): return "Food", "Groceries"
    if any_in(d, DINING): return "Food", "Dining"
    if any_in(d, TRAVEL): return "Travel", "Travel & Lodging"
    if any_in(d, PETS): return "Pets", "Pet Care"
    if any_in(d, KIDS): return "Kids & Family", "Activities & Childcare"
    if any_in(d, HOME): return "Home", "Home & Garden"
    if any_in(d, PERSONAL): return "Personal Care", "Beauty & Grooming"
    if any_in(d, HEALTH): return "Health", "Health & Medical"
    if any_in(d, AUTO): return "Transportation", "Fuel, Auto & Parking"
    if any_in(d, ENTERTAINMENT): return "Entertainment", "Entertainment & Streaming"
    if any_in(d, BUSINESS): return "Business & Technology", "Software & Services"
    if "GOOGLE *FI" in d: return "Bills & Utilities", "Mobile Phone"
    if "GOOGLE *GOOGLE NEST" in d: return "Home", "Home Services"
    if any_in(d, PROFESSIONAL): return "Professional Services", "Legal, Tax & Advisory"
    if any_in(d, GIVING): return "Gifts & Giving", "Donations"
    if any_in(d, GOVERNMENT): return "Taxes & Government", "Government Payments"
    if any_in(d, SHOPPING): return "Shopping", "General Merchandise"
    return "Other", "Uncategorized"

def money(s): return float(s.replace(",", ""))

def parse_statement(path):
    text = subprocess.check_output(["pdftotext", "-layout", str(path), "-"], text=True)
    oc = OPEN_CLOSE_RE.search(text)
    if not oc:
        raise ValueError(f"No statement period found in {path.name}")
    opening = datetime.strptime(oc.group(1), "%m/%d/%y").date()
    closing = datetime.strptime(oc.group(2), "%m/%d/%y").date()
    summary = {k: money(m.group(1)) if (m := p.search(text)) else None for k, p in SUMMARY_PATTERNS.items()}
    card_match = re.search(r"statements-(\d{4})-", path.name)
    card = f"Card •••• {card_match.group(1)}" if card_match else "Unknown card"
    summary.update({"source_file": path.name, "card": card, "opening_date": opening.isoformat(), "closing_date": closing.isoformat()})

    in_activity = False
    tx_type = None
    transactions = []
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("ACCOUNT ACTIVITY"):
            in_activity = True
            continue
        if not in_activity:
            continue
        if line.startswith("PAYMENTS AND OTHER CREDITS"):
            tx_type = "Payment/Credit"
            continue
        if line == "PURCHASE" or line == "PURCHASES":
            tx_type = "Purchase"
            continue
        if line.startswith("FEES CHARGED"):
            tx_type = "Fee"
            continue
        if line.startswith("INTEREST CHARGED") or line.startswith("INTEREST CHARGES") or "Totals Year-to-Date" in line:
            in_activity = False
            continue
        m = TX_RE.match(raw)
        if not m or not tx_type:
            continue
        md, desc, amount_s = m.groups()
        month, day = map(int, md.split("/"))
        year = closing.year - 1 if month > closing.month else closing.year
        tx_date = date(year, month, day)
        amount = money(amount_s)
        category, subcategory = categorize(desc, tx_type)
        weekday = tx_date.strftime("%A")
        possible_lunch = tx_type == "Purchase" and subcategory == "Dining" and tx_date.weekday() < 5
        transactions.append({
            "date": tx_date.isoformat(), "weekday": weekday, "description": re.sub(r"\s+", " ", desc).strip(),
            "vendor": normalize_vendor(desc),
            "amount": amount, "transaction_type": tx_type, "category": category, "subcategory": subcategory,
            "possible_weekday_lunch": "Yes" if possible_lunch else "No", "source_file": path.name,
            "statement_close": closing.isoformat(), "card": card,
        })
    return summary, transactions

def main():
    OUT.mkdir(exist_ok=True)
    statements, transactions = [], []
    for path in sorted(INPUT.glob("*.pdf")):
        summary, txs = parse_statement(path)
        statements.append(summary)
        transactions.extend(txs)
    payload = {"statements": statements, "transactions": transactions}
    (OUT / "statement_data.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"statement_count": len(statements), "transaction_count": len(transactions), "purchase_rows": sum(t["transaction_type"] == "Purchase" for t in transactions)}, indent=2))

if __name__ == "__main__":
    main()
