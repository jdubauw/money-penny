"""Deterministic extraction. Models never invent transaction dates or amounts."""
import csv
import io
import re
import subprocess
from collections import Counter
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path

from scripts.process_statements import (OPEN_CLOSE_RE, SUMMARY_PATTERNS, TX_RE,
                                       categorize, normalize_vendor)

KINDS = ["purchase", "refund", "payment", "transfer", "income", "fee", "interest", "credit"]
CATEGORIES = ["Food", "Travel", "Pets", "Kids & Family", "Home", "Personal Care", "Health",
              "Transportation", "Entertainment", "Business & Technology", "Bills & Utilities",
              "Professional Services", "Gifts & Giving", "Taxes & Government", "Shopping", "Gas", "Payments", "Other"]


def cents(value):
    s = str(value).strip().replace("$", "")
    if not s:
        return 0
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    if "," in s and not re.fullmatch(r"-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?", s):
        raise ValueError("Use a period for decimal amounts and commas only for thousands separators.")
    s = s.replace(",", "")
    try:
        number = Decimal(s)
        if not number.is_finite() or number != number.quantize(Decimal("0.01")):
            raise ValueError("Amounts must be finite and have at most two decimal places.")
        result = int(number * 100)
        if abs(result) > 10**12:
            raise ValueError("Amount exceeds the supported limit.")
        return result
    except InvalidOperation as exc:
        raise ValueError(f"Invalid amount: {s[:40]}") from exc


def transaction_kind(description, amount, account_kind):
    d = description.upper()
    if any(term in d for term in ["PAYMENT THANK", "AUTOPAY", "CARD PAYMENT", "CREDIT CARD PAYMENT", "AUTOMATIC PAYMENT - THANK YOU", "AUTOMATIC PAYMENT THANK YOU"]):
        return "payment"
    if any(term in d for term in ["TRANSFER", "PAYMENT TO CHASE"]):
        return "transfer"
    if "INTEREST CHARGE" in d:
        return "interest"
    if any(term in d for term in ["ANNUAL FEE", "LATE FEE", "OVERDRAFT FEE"]):
        return "fee"
    if amount < 0:
        if "REFUND" in d or "RETURN" in d:
            return "refund"
        return "income" if account_kind == "checking" else "credit"
    return "purchase"


def make_row(tx_date, description, amount, kind):
    if not description.strip():
        raise ValueError("Transaction description is empty.")
    merchant_description = re.sub(r"^SQ\s*\*\s*", "", description.strip(), flags=re.I)
    category, subcategory = categorize(merchant_description, "Purchase")
    # General retailers are ambiguous; a processor prefix does not obscure a named merchant.
    d = description.upper()
    ambiguous = any(term in d for term in ["AMAZON", "AMZN", "WALMART", "WAL-MART", "TARGET"])
    if ambiguous:
        category, subcategory = "Other", "Uncategorized"
    elif re.search(r"\bICE\s*CREAM\b", d):
        category, subcategory = "Food", "Dining"
    elif re.search(r"\bPHILLIPS\s*66\b", d):
        category, subcategory = "Gas", "Fuel"
    elif re.search(r"\bYOUTUBE\s*TV\b", d):
        category, subcategory = "Entertainment", "TV & Streaming"
    if kind == "credit" and amount < 0 and transaction_kind(description, amount, "credit") == "payment":
        kind = "payment"
    if kind not in ["purchase", "refund", "fee", "interest"]:
        category, subcategory = ("Payments", "Credit card payment") if kind == "payment" else ("Other", "")
    return {"date": tx_date.isoformat(), "description": description.strip(),
            "vendor": normalize_vendor(description), "amount_cents": amount, "kind": kind,
            "category": category, "subcategory": subcategory,
            "needs_review": (kind in ["purchase", "refund", "fee", "interest"] and category == "Other") or kind == "credit",
            "category_source": "builtin", "explanation": ""}


def read_csv(path, options, account_kind):
    try:
        text = path.read_bytes().decode("utf-8-sig")
    except UnicodeDecodeError:
        text = path.read_bytes().decode("cp1252")
    try:
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = reader.fieldnames or []
    if not headers or len(headers) != len(set(headers)):
        raise ValueError("CSV must have a header row with unique column names.")
    aliases = {
        "date": ["transaction date", "date", "posting date", "post date"],
        "description": ["description", "merchant", "payee", "memo", "transaction description"],
        "amount": ["amount", "transaction amount"], "debit": ["debit", "debits", "withdrawal", "withdrawals"],
        "credit": ["credit", "credits", "deposit", "deposits"], "type": ["type", "transaction type"],
    }
    mapping = options.get("mapping", {})
    if not isinstance(mapping, dict):
        raise ValueError("Column mapping must be an object.")
    found = {key: mapping.get(key) or next((h for alias in values for h in headers if h.strip().lower() == alias), None)
             for key, values in aliases.items()}
    for key, header in found.items():
        if header and header not in headers:
            raise ValueError(f"Mapped {key} column was not found: {header}")
    if not found["date"] or not found["description"] or not (found["amount"] or found["debit"] or found["credit"]):
        raise ValueError("Map Date, Description, and Amount (or Debit/Credit) columns in the upload form.")
    fmt = options.get("date_format", "%m/%d/%Y")
    negative_expenses = options.get("negative_expenses", False)
    rows = []
    for number, item in enumerate(reader, start=2):
        if not any(v for v in item.values()):
            continue
        try:
            if None in item:
                raise ValueError("Too many CSV columns; check the delimiter or quoting.")
            date_value = item[found["date"]].strip()
            try:
                tx_date = date.fromisoformat(date_value)
            except ValueError:
                tx_date = datetime.strptime(date_value, fmt).date()
            if found["amount"]:
                if not (item[found["amount"]] or "").strip():
                    raise ValueError("Missing amount.")
                amount = cents(item[found["amount"]])
                if negative_expenses:
                    amount = -amount
            else:
                debit = cents(item.get(found["debit"], "") or "")
                credit = cents(item.get(found["credit"], "") or "")
                if debit < 0 or credit < 0 or (debit and credit):
                    raise ValueError("Debit/Credit columns must contain positive values on only one side.")
                if not (str(item.get(found["debit"], "") or "").strip() or str(item.get(found["credit"], "") or "").strip()):
                    raise ValueError("Missing debit and credit amounts.")
                amount = debit - credit
            desc = item[found["description"]]
            kind = transaction_kind(desc, amount, account_kind)
            label = (item.get(found["type"], "") or "").strip().lower()
            kind_aliases = {"sale": "purchase", "return": "refund", "payment/credit": "credit"}
            label = kind_aliases.get(label, label)
            if label in KINDS:
                kind = label
            rows.append(make_row(tx_date, desc, amount, kind))
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise ValueError(f"CSV row {number}: {exc}") from exc
        if len(rows) > 25000:
            raise ValueError("Import is limited to 25,000 transactions. Split this export into smaller files.")
    if not rows:
        raise ValueError("No transactions were found in this CSV.")
    return {"rows": rows, "summary": {}, "warnings": [], "mapping": found}


def read_pdf(path):
    try:
        result = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, timeout=45, check=True)
    except (subprocess.SubprocessError, FileNotFoundError) as exc:
        raise ValueError("PDF text extraction failed. Check that the PDF is readable and not password-protected.") from exc
    text = result.stdout
    oc = OPEN_CLOSE_RE.search(text)
    if not oc:
        raise ValueError("Unsupported PDF layout or scanned PDF. Use a CSV export; this version supports your current Chase credit-card statement layout.")
    opening = datetime.strptime(oc.group(1), "%m/%d/%y").date()
    closing = datetime.strptime(oc.group(2), "%m/%d/%y").date()
    patterns = {**SUMMARY_PATTERNS,
                "interest": re.compile(r"Interest Charged\s+\+?\$?([\d,]+\.\d{2})"),
                "fees": re.compile(r"Fees Charged\s+\+?\$?([\d,]+\.\d{2})")}
    summary = {k: cents(m.group(1)) if (m := pattern.search(text)) else None for k, pattern in patterns.items()}
    summary.update({"opening_date": opening.isoformat(), "closing_date": closing.isoformat()})
    active = False
    section = None
    rows = []
    suspicious = []
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("ACCOUNT ACTIVITY"):
            active = True
            continue
        if not active:
            continue
        if line.startswith("PAYMENTS AND OTHER CREDITS"):
            section = "credit"
            continue
        if line in ["PURCHASE", "PURCHASES"]:
            section = "purchase"
            continue
        if line.startswith("FEES CHARGED"):
            section = "fee"
            continue
        if line.startswith("INTEREST CHARGED"):
            section = "interest"
            continue
        if line.startswith("INTEREST CHARGES") or "Totals Year-to-Date" in line:
            active = False
            continue
        match = TX_RE.match(raw)
        if not match:
            if section and re.match(r"^\d{2}/\d{2}\s", line):
                suspicious.append(line[:120])
            continue
        if not section:
            continue
        md, desc, amount = match.groups()
        month, day = map(int, md.split("/"))
        year = closing.year - 1 if month > closing.month else closing.year
        tx_date = date(year, month, day)
        # Statements contain transaction dates, which can precede the posting period.
        if not opening - timedelta(days=31) <= tx_date <= closing:
            suspicious.append(f"Transaction date outside statement period: {tx_date}")
        value = cents(amount)
        kind = transaction_kind(desc, value, "credit") if section == "credit" else section
        rows.append(make_row(tx_date, desc, value, kind))
    if not rows:
        raise ValueError("No transactions found. Use a CSV export for this statement.")
    warnings = []
    reconciliation = []
    for key, kinds, multiplier in [("purchases", ["purchase"], 1), ("payments_credits", ["credit", "payment", "refund", "transfer"], -1),
                                    ("fees", ["fee"], 1), ("interest", ["interest"], 1)]:
        actual = sum(r["amount_cents"] for r in rows if r["kind"] in kinds) * multiplier
        expected = summary[key]
        reconciliation.append({"label": key, "expected_cents": expected, "actual_cents": actual,
                               "difference_cents": None if expected is None else actual - expected})
        if expected is None or actual != expected:
            warnings.append(f"{key.replace('_', ' ').title()} could not be reconciled. Compare the extracted rows with the original PDF.")
    if all(summary[k] is not None for k in ["previous_balance", "payments_credits", "purchases", "fees", "interest", "new_balance"]):
        balance = summary["previous_balance"] - summary["payments_credits"] + summary["purchases"] + summary["fees"] + summary["interest"]
        if balance != summary["new_balance"]:
            warnings.append("Statement balance equation does not reconcile.")
    if suspicious:
        warnings.append(f"{len(suspicious)} date-bearing lines need checking; extraction may be incomplete.")
    return {"rows": rows, "summary": summary, "reconciliation": reconciliation, "warnings": warnings,
            "unparsed_lines": suspicious}


def parse(path, options, account_kind):
    return read_pdf(path) if path.suffix.lower() == ".pdf" else read_csv(path, options, account_kind)


def fingerprint(row):
    return (str(row["date"]), re.sub(r"\s+", " ", row["description"].upper()).strip(), row["amount_cents"])


def flag_duplicates(rows, existing):
    # Multiset matching preserves legitimate identical purchases within an import.
    counts = Counter(fingerprint(row) for row in existing)
    for row in rows:
        key = fingerprint(row)
        row["duplicate_candidate"] = counts[key] > 0
        if counts[key]:
            counts[key] -= 1
    return rows
