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
