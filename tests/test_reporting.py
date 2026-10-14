from datetime import date
from types import SimpleNamespace

import pytest
from app.reporting import spending_report
from app.database import Session, Transaction


def tx(day, amount, category="Shopping", kind="purchase"):
    return SimpleNamespace(date=date.fromisoformat(day), amount_cents=amount, category=category,
                           kind=kind, vendor=category + " Store", needs_review=False)


def test_monthly_history_missing_periods_and_percentages():
    rows = [tx("2026-01-15", 10000), tx("2026-03-01", 3000, "Food"), tx("2026-03-02", 7000),
            tx("2026-03-03", -1000, kind="refund"), tx("2026-03-04", -9000, kind="payment")]
    result = spending_report(rows, "monthly", "2026-03", date(2026, 3, 10))
    assert result["spend_cents"] == 9000 and result["spending_count"] == 3 and result["count"] == 4
    assert result["is_current"]
    assert len(result["series"]) == 12
    assert result["series"][0]["key"] == "2025-04"
    assert result["series"][-2]["key"] == "2026-02" and not result["series"][-2]["has_data"]
    assert result["previous_spend_cents"] is None and result["change_cents"] is None
    assert result["average_cents"] == 10000 and result["average_period_count"] == 1
    assert result["categories"][0]["name"] == "Shopping"
    assert result["categories"][0]["percent"] == 66.7
    assert result["categories"][1]["percent"] == 33.3


def test_quarterly_and_yearly_boundaries_with_fees_interest_and_refunds():
    rows = [tx("2025-12-31", 8000), tx("2026-01-01", 10000), tx("2026-03-31", 2000),
            tx("2026-03-31", 100, kind="fee"), tx("2026-03-31", 50, kind="interest"),
            tx("2026-03-31", -500, kind="refund"), tx("2026-04-01", 9999),
            tx("2026-02-01", -100000, kind="transfer")]
    quarter = spending_report(rows, "quarterly", "2026-Q1", date(2026, 4, 2))
    assert quarter["start"] == "2026-01-01" and quarter["end"] == "2026-03-31"
    assert quarter["spend_cents"] == 11650
    assert quarter["previous_spend_cents"] == 8000 and quarter["change_cents"] == 3650
    assert quarter["change_percent"] == 45.6
    assert quarter["series"][-2]["key"] == "2025-Q4"
    year = spending_report(rows, "yearly", "2026", date(2026, 4, 2))
    assert year["spend_cents"] == 21649 and year["year_end_period"] == "2025"
    assert year["previous_spend_cents"] == 8000


def test_signed_categories_do_not_turn_refunds_into_spending():
    result = spending_report([tx("2026-01-01", 10000), tx("2026-01-02", -2000, "Food", "refund")],
                             period="2026-01")
    assert result["spend_cents"] == 8000
    assert result["donut_total_cents"] == 10000 and result["donut_uses_positive_balances"]
    assert result["categories"][0]["percent"] == 100.0
    assert result["categories"][1]["percent"] is None
    credits = spending_report([tx("2026-01-01", -2500, kind="refund")], period="2026-01")
    assert credits["spend_cents"] == -2500 and credits["donut_total_cents"] == 0
    assert credits["categories"][0]["percent"] is None


def test_empty_period_zero_spending_and_default_latest_import():
    result = spending_report([], today=date(2026, 10, 13))
    assert result["period"] == "2026-10" and result["count"] == 0
    assert all(not point["has_data"] for point in result["series"])
    assert result["average_cents"] is None
    assert spending_report([tx("2026-02-01", 500)], today=date(2026, 10, 13))["period"] == "2026-02"
    zero = spending_report([tx("2026-01-01", 1000), tx("2026-01-02", -1000, kind="refund")], period="2026-01")
    assert zero["series"][-1]["has_data"] and zero["series"][-1]["spend_cents"] == 0


@pytest.mark.parametrize("view,period", [("monthly","2026-13"), ("monthly","2026-00"),
    ("quarterly","2026-Q5"), ("yearly","0000"), ("yearly","2026-01")])
def test_invalid_periods(view,period):
    with pytest.raises(ValueError): spending_report([], view, period)


def test_period_api_account_scope_and_spending_drilldown(client):
    with Session() as session:
        for index, (account,day,amount,kind,category) in enumerate([
            ("Card A","2026-01-02",10000,"purchase","Shopping"),
            ("Card A","2026-02-02",-1000,"refund","Shopping"),
            ("Card A","2026-01-03",-12000,"payment","Other"),
            ("Card B","2026-01-04",99999,"purchase","Shopping"),
        ]):
            session.add(Transaction(import_id=1,row_index=index,account=account,date=date.fromisoformat(day),
                description=category,vendor=category,amount_cents=amount,kind=kind,category=category,
                subcategory="",category_source="builtin",needs_review=False,explanation=""))
        session.commit()
    result=client.get("/api/reports/spending?view=yearly&period=2026&account=Card%20A")
    assert result.status_code == 200
    report=result.json()
    assert report["spend_cents"] == 9000 and report["count"] == 3
    ledger=client.get("/api/transactions?account=Card%20A&start=2026-01-01&end=2026-12-31&spending=true&category=Shopping").json()
    assert sum(row["amount_cents"] for row in ledger["rows"]) == report["spend_cents"]
    assert ledger["count"] == report["spending_count"] == 2
    assert client.get("/api/reports/spending?view=weekly").status_code == 422
    assert client.get("/api/reports/spending?view=quarterly&period=2026-Q9").status_code == 422


def report_row(day, amount, vendor="Stream", category="Entertainment", kind="purchase", account="Card A"):
    row = tx(day, amount, category, kind)
    row.vendor, row.account = vendor, account
    return row


def test_vendor_report_refunds_split_and_purchase_metrics():
    from app.reporting import vendor_report
    rows = [report_row("2026-01-01", 2000), report_row("2026-02-01", 4000, account="Card B"),
            report_row("2026-02-02", -500, kind="refund"), report_row("2026-02-02", -6000, kind="payment")]
    result = vendor_report(rows)
    assert len(result) == 1
    assert result[0]["spend_cents"] == 5500 and result[0]["count"] == 3
    assert result[0]["average_cents"] == 3000 and result[0]["largest_cents"] == 4000
    assert len(vendor_report(rows, True)) == 2
    assert vendor_report([report_row("2026-01-01", -500, kind="refund")])[0]["average_cents"] is None


def test_savings_suggestions_confirmation_and_nonoverlapping_targets():
    from app.reporting import savings_report
    rows = [report_row(f"2026-{m:02d}-05", 1000) for m in (1, 2, 3)]
    rows += [report_row("2026-01-03", 3000, vendor="Dining", category="Food")]
    result = savings_report(rows, {}, {"Entertainment": 10, "Food": 10})
    assert len(result["services"]) == 1
    assert result["services"][0]["annual_cents"] == 12000
    assert result["services"][0]["savings_cents"] == 0
    plan = {"Stream": {"confirmed": True, "decision": "cancel", "cadence": "monthly", "cost_cents": 1000}}
    confirmed = savings_report(rows, plan, {"Entertainment": 10, "Food": 10})
    assert confirmed["total_savings_cents"] == 13200
    assert next(t for t in confirmed["targets"] if t["category"] == "Entertainment")["savings_cents"] == 0
    annual = savings_report([], {"Annual service": {"confirmed": True, "decision": "cancel", "cadence": "annual", "cost_cents": 9900}}, {})
    assert annual["total_savings_cents"] == 9900
    assert savings_report(rows[:2], {}, {})["services"] == []


def test_report_settings_persist_validate_and_reset(client):
    long_vendor = "Vendor" * 33
    plan = {"vendor": long_vendor, "category": "Entertainment", "cadence": "annual", "cost_cents": 12345, "confirmed": True, "decision": "cancel"}
    assert client.put("/api/reports/savings/service", json=plan).status_code == 200
    assert client.put("/api/reports/savings/target", json={"category": "Food", "percent": 15}).status_code == 200
    result = client.get("/api/reports/savings").json()
    assert result["total_savings_cents"] == 12345
    assert result["services"][0]["vendor"] == long_vendor
    assert result["targets"][0]["percent"] == 15
    assert client.put("/api/reports/savings/service", json={**plan, "cost_cents": -1}).status_code == 422
    assert client.put("/api/reports/savings/target", json={"category": "Food", "percent": 101}).status_code == 422
    assert client.get("/api/reports/vendors?start=2026-02-01&end=2026-01-01").status_code == 422
    assert client.delete("/api/reports/savings/service", params={"vendor": long_vendor}).status_code == 200
    assert client.get("/api/reports/savings").json()["services"] == []

    import os
    assert client.post("/api/settings/reset", json={"confirmation": "DELETE ALL DATA", "password": os.environ["APP_PASSWORD"]}).status_code == 200
    assert client.get("/api/reports/savings").json()["targets"] == []


def test_savings_missing_months_and_irregular_purchases():
    from app.reporting import savings_report
    rows = [report_row("2026-01-01", 1000), report_row("2026-03-01", 1000), report_row("2026-03-03", 2500)]
    result = savings_report(rows, {}, {"Entertainment": 10})
    assert result["missing_months"] == ["2026-02"]
    assert result["observed_months"] == 2
    assert result["services"] == []
    assert result["targets"][0]["annual_cents"] == 27000


def test_vendor_api_filters_and_savings_account_scope(client):
    with Session() as session:
        for i, row in enumerate([report_row("2026-01-01", 1000), report_row("2026-02-01", 1000),
                                 report_row("2026-03-01", 1000), report_row("2026-03-01", 99999, account="Card B")]):
            session.add(Transaction(import_id=1, row_index=i, account=row.account, date=row.date,
                                    vendor=row.vendor, description=row.vendor, amount_cents=row.amount_cents,
                                    kind=row.kind, category=row.category))
        session.commit()
    vendors = client.get("/api/reports/vendors", params={"account": "Card A", "start": "2026-02-01", "category": "Entertainment"}).json()
    assert len(vendors) == 1 and vendors[0]["spend_cents"] == 2000
    assert client.get("/api/reports/vendors?search=nonexistent").json() == []
    scoped = client.get("/api/reports/savings?account=Card%20A").json()
    assert len(scoped["services"]) == 1 and scoped["services"][0]["spend_cents"] == 3000
    assert client.get("/api/reports/savings?account=Card%20B").json()["services"] == []
