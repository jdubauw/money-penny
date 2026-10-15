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


def test_transaction_sorting_happens_before_pagination_and_preserves_filters(client):
    with Session() as session:
        for i in range(105):
            session.add(Transaction(import_id=1, row_index=i, account="Card A", date=date(2026,1,1),
                                    vendor=f"Vendor {i:03d}", description="Purchase", amount_cents=105-i,
                                    kind="purchase", category="Shopping"))
        session.add(Transaction(import_id=2, row_index=0, account="Card B", date=date(2026,1,1),
                                vendor="Another vendor", description="Purchase", amount_cents=99999,
                                kind="purchase", category="Shopping"))
        session.commit()
    params = {"account": "Card A", "sort": "amount_cents", "direction": "asc"}
    first = client.get("/api/transactions", params=params).json()
    second = client.get("/api/transactions", params={**params, "page": 2}).json()
    assert first["count"] == 105 and first["pages"] == 2
    assert [r["amount_cents"] for r in first["rows"] + second["rows"]] == list(range(1,106))
    descending = client.get("/api/transactions", params={**params, "direction":"desc"}).json()
    assert descending["rows"][0]["amount_cents"] == 105
    by_name = client.get("/api/transactions?account=Card%20A&sort=vendor&direction=asc").json()
    assert by_name["rows"][0]["vendor"] == "Vendor 000"
    assert client.get("/api/transactions?sort=unknown").status_code == 422
    assert client.get("/api/transactions?direction=unknown").status_code == 422


def test_subscription_split_billing_with_incidental_charge():
    from app.reporting import savings_report
    rows = [report_row("2026-01-02", 309, vendor="YouTube TV"),
            report_row("2026-01-10", 10065, vendor="YouTube TV"),
            report_row("2026-02-10", 10065, vendor="YouTube TV")]
    for month in range(3, 8):
        rows.extend([report_row(f"2026-{month:02d}-10", amount, vendor="YouTube TV") for amount in (8984,1081)])
    report = savings_report(rows, {}, {})
    service = report["services"][0]
    assert service["vendor"] == "YouTube TV"
    assert service["cost_cents"] == 10065 and service["annual_cents"] == 120780
    assert service["spend_cents"] == sum(r.amount_cents for r in rows)
    assert service["months_charged"] == 7 and service["last_charge"] == "2026-07-10"
    assert not service["confirmed"] and service["savings_cents"] == 0
    saved = {"YouTube TV": {"cost_cents": 11000, "cadence": "monthly", "confirmed": True, "decision": "cancel"}}
    assert savings_report(rows, saved, {})["services"][0]["annual_cents"] == 132000


def test_subscription_pattern_skips_extra_charges_and_uses_monthly_total():
    from app.reporting import savings_report
    rows = [report_row(f"2026-{month:02d}-{day:02d}", amount)
            for month in (1,2,3,4) for day, amount in [(5,900),(5,100)]]
    rows.extend([report_row("2026-01-12",50),report_row("2026-03-12",50)])
    result = savings_report(rows, {}, {})
    assert len(result["services"]) == 1
    assert result["services"][0]["cost_cents"] == 1000
    assert result["services"][0]["spend_cents"] == 4100


@pytest.mark.parametrize("charges", [
    [("2026-01-01",1000),("2026-01-23",1000),("2026-02-15",1000)],
    [("2026-01-05",1000),("2026-02-05",1500),("2026-03-05",2000)],
    [("2026-01-05",1000),("2026-03-05",1000),("2026-05-05",1000)],
    [("2026-01-05",500),("2026-01-05",500),("2026-02-05",1000)],
])
def test_subscription_detector_rejects_irregular_or_insufficient_history(charges):
    from app.reporting import savings_report
    assert savings_report([report_row(day, amount) for day,amount in charges], {}, {})["services"] == []


def test_subscription_pattern_handles_year_rollover_and_refunds():
    from app.reporting import savings_report
    rows = [report_row(day, 1000) for day in ("2025-12-20","2026-01-20","2026-02-20")]
    rows.append(report_row("2026-02-21", -500, kind="refund"))
    result = savings_report(rows, {}, {})["services"][0]
    assert result["cost_cents"] == 1000 and result["spend_cents"] == 2500


def test_subscription_pattern_prefers_main_bill_to_smaller_recurring_fee():
    from app.reporting import savings_report
    rows = [report_row(f"2026-{month:02d}-{day:02d}", amount)
            for month in (1,2,3,4) for day,amount in [(5,1000),(12,50)]]
    service = savings_report(rows, {}, {})["services"][0]
    assert service["cost_cents"] == 1000
    assert service["spend_cents"] == 4200


@pytest.mark.parametrize("vendor,amount", [("Whoop",39835),("Strava",16236),("WHOOP",39835)])
def test_annual_fitness_memberships_are_subscription_suggestions(vendor, amount):
    from app.reporting import savings_report
    rows = [report_row("2026-02-17", amount, vendor=vendor, category="Health")]
    service = savings_report(rows, {}, {})["services"][0]
    assert service["vendor"] == vendor and service["cadence"] == "annual"
    assert service["annual_cents"] == amount and service["cost_cents"] == amount
    assert service["decision"] == "review" and not service["confirmed"]
    assert service["savings_cents"] == 0


def test_annual_membership_latest_charge_monthly_evidence_and_saved_override():
    from app.reporting import savings_report
    rows = [report_row("2025-02-17",30000,vendor="Whoop"),report_row("2026-02-17",39835,vendor="Whoop")]
    assert savings_report(rows,{}, {})["services"][0]["annual_cents"] == 39835
    monthly = [report_row(f"2026-{m:02d}-05",3000,vendor="Whoop") for m in (1,2,3)]
    assert savings_report(monthly,{}, {})["services"][0]["cadence"] == "monthly"
    plan = {"Whoop":{"cadence":"monthly","cost_cents":2500,"confirmed":True,"decision":"keep"}}
    saved = savings_report(rows,plan,{})["services"][0]
    assert saved["annual_cents"] == 30000 and saved["cadence"] == "monthly" and saved["confirmed"]
    assert savings_report([report_row("2026-02-17",-39835,vendor="Whoop",kind="refund")],{}, {})["services"] == []
    assert savings_report([report_row("2026-02-17",1000,vendor="Whoop Store")],{}, {})["services"] == []
