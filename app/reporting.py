"""Calendar spending reports, with explicit missing-data and signed-credit handling."""
import calendar
import re
from collections import defaultdict
from datetime import date

SPENDING_KINDS = ("purchase", "refund", "fee", "interest")


def period_key(day, view):
    if view == "monthly":
        return f"{day.year:04d}-{day.month:02d}"
    if view == "quarterly":
        return f"{day.year:04d}-Q{(day.month - 1) // 3 + 1}"
    return f"{day.year:04d}"


def period_start(key, view):
    if view == "monthly" and re.fullmatch(r"\d{4}-\d{2}", key):
        year, month = map(int, key.split("-"))
        return date(year, month, 1)
    if view == "quarterly" and re.fullmatch(r"\d{4}-Q[1-4]", key):
        return date(int(key[:4]), (int(key[-1]) - 1) * 3 + 1, 1)
    if view == "yearly" and re.fullmatch(r"\d{4}", key):
        return date(int(key), 1, 1)
    raise ValueError("Choose a valid calendar period for this report view.")


def bounds(start, view):
    month = start.month if view == "monthly" else start.month + 2 if view == "quarterly" else 12
    return start, date(start.year, month, calendar.monthrange(start.year, month)[1])


def shift(start, offset, view):
    step = {"monthly": 1, "quarterly": 3, "yearly": 12}[view]
    absolute = start.year * 12 + start.month - 1 + offset * step
    year, month = divmod(absolute, 12)
    return date(year, month + 1, 1) if 1 <= year <= 9999 else None


def label(start, view):
    if view == "monthly":
        return f"{calendar.month_name[start.month]} {start.year}"
    if view == "quarterly":
        return f"Q{(start.month - 1) // 3 + 1} {start.year}"
    return str(start.year)


def spending_report(rows, view="monthly", period=None, today=None):
    today = today or date.today()
    grouped = defaultdict(list)
    for row in rows:
        grouped[period_key(row.date, view)].append(row)
    available = sorted(set(grouped) | {period_key(today, view)}, reverse=True)
    selected = period or (max(grouped) if grouped else period_key(today, view))
    start = period_start(selected, view)
    start, end = bounds(start, view)
    current = grouped.get(selected, [])
    expenses = [r for r in current if r.kind in SPENDING_KINDS]
    categories, vendors = defaultdict(list), defaultdict(list)
    for row in expenses:
        categories[row.category].append(row)
        vendors[row.vendor].append(row)
    amounts = {name: sum(r.amount_cents for r in items) for name, items in categories.items()}
    total = sum(amounts.values())
    has_negative = any(value < 0 for value in amounts.values())
    positive = sum(max(0, value) for value in amounts.values())
    denominator = positive if has_negative or total <= 0 else total
    category_rows = [{"name": name, "amount_cents": value, "transaction_count": len(categories[name]),
                      "percent": round(value / denominator * 100, 1) if value >= 0 and denominator else None}
                     for name, value in amounts.items()]
    series = []
    for offset in range(-11 if view == "monthly" else -5, 1):
        beginning = shift(start, offset, view)
        if beginning is None:
            continue
        key = period_key(beginning, view)
        members = grouped.get(key, [])
        first, last = bounds(beginning, view)
        series.append({"key": key, "label": label(beginning, view), "start": first.isoformat(), "end": last.isoformat(),
                       "spend_cents": sum(r.amount_cents for r in members if r.kind in SPENDING_KINDS),
                       "transaction_count": len(members), "has_data": bool(members), "is_selected": key == selected})
    prior = series[-2] if len(series) > 1 else None
    average_members = [point["spend_cents"] for point in series[:-1] if point["has_data"]]
    average = round(sum(average_members) / len(average_members)) if average_members else None
    previous = prior["spend_cents"] if prior and prior["has_data"] else None
    delta = total - previous if current and previous is not None else None
    years = sorted({r.date.year for r in rows if r.date.year < today.year}, reverse=True)
    return {
        "view": view, "period": selected, "label": label(start, view),
        "start": start.isoformat(), "end": end.isoformat(), "is_current": selected == period_key(today, view),
        "available_periods": [{"key": key, "label": label(period_start(key, view), view)} for key in available],
        "year_end_period": str(years[0]) if years else None,
        "spend_cents": total, "count": len(current), "spending_count": len(expenses),
        "review_count": sum(r.needs_review for r in current),
        "unclassified_credit_cents": sum(r.amount_cents for r in current if r.kind == "credit"),
        "purchases_cents": sum(r.amount_cents for r in expenses if r.kind == "purchase"),
        "refunds_cents": sum(r.amount_cents for r in expenses if r.kind == "refund"),
        "fees_cents": sum(r.amount_cents for r in expenses if r.kind == "fee"),
        "interest_cents": sum(r.amount_cents for r in expenses if r.kind == "interest"),
        "categories": sorted(category_rows, key=lambda r: (-r["amount_cents"], r["name"])),
        "vendors": sorted([{"name": name, "amount_cents": sum(r.amount_cents for r in members),
                            "transaction_count": len(members)} for name, members in vendors.items()],
                          key=lambda r: (-r["amount_cents"], r["name"]))[:12],
        "donut_total_cents": denominator, "donut_uses_positive_balances": has_negative,
        "series": series, "average_cents": average, "average_period_count": len(average_members),
        "previous_label": prior["label"] if prior else None, "previous_spend_cents": previous,
        "change_cents": delta, "change_percent": round(delta / previous * 100, 1) if delta is not None and previous > 0 else None,
        "imported_start": min((r.date.isoformat() for r in current), default=None),
        "imported_through": max((r.date.isoformat() for r in current), default=None),
    }
