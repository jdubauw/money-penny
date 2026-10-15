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


def vendor_report(rows, split=False):
    groups = defaultdict(list)
    for row in rows:
        if row.kind in SPENDING_KINDS:
            groups[(row.vendor, row.account if split else "", row.category if split else "")].append(row)
    result = []
    for (vendor, account, category), members in groups.items():
        purchases = [r.amount_cents for r in members if r.kind == "purchase" and r.amount_cents > 0]
        result.append(dict(vendor=vendor, account=account,
            category=category or ", ".join(sorted({r.category for r in members})),
            accounts=sorted({r.account for r in members}),
            spend_cents=sum(r.amount_cents for r in members), count=len(members),
            average_cents=round(sum(purchases) / len(purchases)) if purchases else None,
            largest_cents=max(purchases) if purchases else None))
    return sorted(result, key=lambda r: (-r["spend_cents"], r["vendor"], r["account"], r["category"]))


def recurring_monthly_cost(daily):
    """Find a stable billing sequence across three or more consecutive months.

    Same-day purchases are already combined. Other charge dates may be incidental;
    they must not interrupt an otherwise recurring sequence or set its price.
    """
    from statistics import median

    charges = sorted(daily.items())
    def rank(sequence):
        # Prefer the longest pattern, then the most recent billing month.
        # Within that month, a larger recurring bill wins over incidental fees.
        last = sequence[-1][0]
        return len(sequence), last.year, last.month, sum(amount for _, amount in sequence)

    best = []
    for low in sorted(set(daily.values())):
        candidates = [(day, amount) for day, amount in charges if low <= amount <= low * 1.25]
        if len(candidates) < 3:
            continue
        lengths, previous = [], []
        for i, (day, amount) in enumerate(candidates):
            length, parent = 1, None
            for j in range(i - 1, -1, -1):
                prior = candidates[j][0]
                gap = (day - prior).days
                if gap > 40:
                    break
                consecutive_month = (day.year * 12 + day.month) - (prior.year * 12 + prior.month) == 1
                if 20 <= gap <= 40 and consecutive_month and lengths[j] + 1 > length:
                    length, parent = lengths[j] + 1, j
            lengths.append(length)
            previous.append(parent)
        last = max(range(len(candidates)), key=lambda i: (lengths[i], candidates[i][0]))
        if lengths[last] < 3:
            continue
        sequence = []
        while last is not None:
            sequence.append(candidates[last])
            last = previous[last]
        sequence.reverse()
        if not best or rank(sequence) > rank(best):
            best = sequence
    return round(median(amount for _, amount in best)) if best else None


def savings_report(rows, plans, targets):
    from statistics import median
    groups = defaultdict(list)
    for row in rows:
        groups[row.vendor].append(row)
    services = []
    for vendor in sorted(set(groups) | set(plans)):
        members = groups[vendor]
        purchases = sorted([r for r in members if r.kind == "purchase" and r.amount_cents > 0], key=lambda r: r.date)
        daily = defaultdict(int)
        for row in purchases:
            daily[row.date] += row.amount_cents
        days = sorted(daily)
        monthly_cost = recurring_monthly_cost(daily)
        plan = plans.get(vendor)
        # These membership merchants can have only one annual charge in imported history.
        # Treat them as suggestions, not confirmed subscriptions; saved plans win.
        annual_membership = vendor.strip().casefold() in {"whoop", "strava"} and bool(purchases) and monthly_cost is None
        if plan is None and monthly_cost is None and not annual_membership:
            continue
        plan = plan or {}
        cadence = plan.get("cadence", "annual" if annual_membership else "monthly")
        observed_cost = daily[days[-1]] if annual_membership else monthly_cost if monthly_cost is not None else round(median(daily.values())) if daily else 0
        cost = plan.get("cost_cents", observed_cost)
        confirmed = plan.get("confirmed", False)
        annual = cost * (12 if cadence == "monthly" else 1)
        services.append(dict(vendor=vendor, category=plan.get("category") or (purchases[-1].category if purchases else ""),
            cadence=cadence, cost_cents=cost, confirmed=confirmed, decision=plan.get("decision", "review"),
            spend_cents=sum(r.amount_cents for r in members if r.kind in SPENDING_KINDS),
            months_charged=len({(r.date.year, r.date.month) for r in purchases}),
            last_charge=days[-1].isoformat() if days else None, annual_cents=annual,
            savings_cents=annual if confirmed and plan.get("decision") == "cancel" else 0))
    # Exclude confirmed services from category targets to avoid overlapping estimates.
    confirmed_vendors = {s["vendor"] for s in services if s["confirmed"]}
    categories = defaultdict(int)
    months = {(r.date.year, r.date.month) for r in rows}
    for row in rows:
        if row.kind in SPENDING_KINDS and row.vendor not in confirmed_vendors:
            categories[row.category] += row.amount_cents
    missing_months = []
    if months:
        first_month = min(y * 12 + m - 1 for y, m in months)
        last_month = max(y * 12 + m - 1 for y, m in months)
        for absolute in range(first_month, last_month + 1):
            year, month = divmod(absolute, 12)
            if (year, month + 1) not in months:
                missing_months.append(f"{year:04d}-{month + 1:02d}")
    areas = []
    for category in sorted(set(categories) | set(targets)):
        observed = max(0, categories[category])
        annual = round(observed * 12 / len(months)) if months else 0
        percent = targets.get(category, 0)
        areas.append(dict(category=category, spend_cents=observed, annual_cents=annual, percent=percent,
                          savings_cents=round(annual * percent / 100)))
    return dict(services=services, targets=areas, observed_months=len(months), missing_months=missing_months,
                observed_start=min((r.date.isoformat() for r in rows), default=None),
                observed_end=max((r.date.isoformat() for r in rows), default=None),
                total_savings_cents=sum(s["savings_cents"] for s in services) + sum(a["savings_cents"] for a in areas))
