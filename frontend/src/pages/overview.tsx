import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { api, money, queryString } from "@/lib/api";
import { useLedger } from "@/lib/state";
import type { ReportView, SpendingReport } from "@/lib/types";
import { ErrorMessage, Loading } from "@/components/shared";
import {
  categoryColor,
  CategoryDonut,
  CategoryComparisonBars,
  SpendingBars,
} from "@/components/spending-charts";

function shiftedPeriod(report: SpendingReport, offset: number) {
  const day = new Date(report.start + "T12:00:00");
  day.setMonth(
    day.getMonth() +
      offset *
        (report.view === "monthly" ? 1 : report.view === "quarterly" ? 3 : 12),
  );
  return report.view === "yearly"
    ? String(day.getFullYear())
    : report.view === "quarterly"
      ? `${day.getFullYear()}-Q${Math.ceil((day.getMonth() + 1) / 3)}`
      : `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
}
function Change({
  before,
  after,
  valid,
}: {
  before: number;
  after: number;
  valid: boolean;
}) {
  if (!valid) return <span className="text-muted-foreground">—</span>;
  const delta = after - before;
  return (
    <span
      className={`dashboard-change ${delta < 0 ? "is-lower" : delta > 0 ? "is-higher" : ""}`}
    >
      <span className="flex items-center justify-end gap-1">
        {delta < 0 ? (
          <ArrowDownRight className="size-3" />
        ) : delta > 0 ? (
          <ArrowUpRight className="size-3" />
        ) : null}
        {money(Math.abs(delta))}
      </span>
      {before > 0 && (
        <span className="block text-[11px]">
          {Math.abs((delta / before) * 100).toFixed(1)}%
        </span>
      )}
    </span>
  );
}
export function Overview() {
  const {
      bootstrap,
      reportSelection: selection,
      setReportSelection,
      apply,
    } = useLedger(),
    navigate = useNavigate();
  const [compare, setCompare] = useState(true),
    [comparisonChoice, setComparisonChoice] = useState<{
      anchor: string;
      period: string;
    } | null>(null),
    [sort, setSort] = useState<"change" | "amount" | "name">("change");
  const query = useQuery({
    queryKey: ["reports", "spending", selection],
    queryFn: ({ signal }) =>
      api<SpendingReport>(
        "/api/reports/spending?" +
          queryString({
            view: selection.view,
            period: selection.period,
            account: selection.account,
          }),
        { signal },
      ),
  });
  const [showAllMerchants, setShowAllMerchants] = useState(false);
  const r = query.data;
  const anchor = r ? `${r.view}:${r.period}` : "";
  const comparePeriod =
    comparisonChoice?.anchor === anchor
      ? comparisonChoice.period
      : r
        ? shiftedPeriod(r, -1)
        : "";
  const comparison = useQuery({
    queryKey: [
      "reports",
      "dashboard-comparison",
      selection.view,
      comparePeriod,
      selection.account,
    ],
    enabled: compare && !!r,
    queryFn: ({ signal }) =>
      api<SpendingReport>(
        "/api/reports/spending?" +
          queryString({
            view: selection.view,
            period: comparePeriod,
            account: selection.account,
          }),
        { signal },
      ),
  });
  const baseline = compare ? comparison.data : undefined;
  const comparable = !!r?.count && !!baseline?.count;
  const periods = new Map(
    (r?.available_periods || []).map((p) => [p.key, p.label]),
  );
  r?.series.forEach((p) => periods.set(p.key, p.label));
  if (r) {
    periods.set(r.period, r.label);
    if (!periods.has(comparePeriod)) periods.set(comparePeriod, comparePeriod);
  }
  if (baseline) periods.set(baseline.period, baseline.label);
  function drill(report: SpendingReport, extra: Record<string, string> = {}) {
    apply({
      start: report.start,
      end: report.end,
      spending: "true",
      ...(selection.account ? { account: selection.account } : {}),
      ...extra,
    });
    void navigate({ to: "/transactions" });
  }
  function changeView(view: ReportView) {
    const value =
      selection.period ||
      r?.period ||
      new Date().getFullYear() +
        "-" +
        String(new Date().getMonth() + 1).padStart(2, "0");
    const year = value.slice(0, 4),
      month =
        selection.view === "monthly"
          ? Number(value.slice(5, 7))
          : selection.view === "quarterly"
            ? Number(value.slice(-1)) * 3
            : 12;
    setReportSelection({
      ...selection,
      view,
      period:
        view === "yearly"
          ? year
          : view === "quarterly"
            ? `${year}-Q${Math.ceil(month / 3)}`
            : `${year}-${String(month).padStart(2, "0")}`,
    });
  }
  const names = new Set([
    ...(r?.categories.map((c) => c.name) || []),
    ...(baseline?.categories.map((c) => c.name) || []),
  ]);
  const rows = [...names]
    .map((name) => ({
      name,
      current: r?.categories.find((c) => c.name === name)?.amount_cents || 0,
      previous:
        baseline?.categories.find((c) => c.name === name)?.amount_cents || 0,
    }))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "amount"
          ? b.current - a.current || a.name.localeCompare(b.name)
          : Math.abs(b.current - b.previous) -
              Math.abs(a.current - a.previous) || a.name.localeCompare(b.name),
    );
  const maximum = Math.max(
    1,
    ...rows.flatMap((row) => [Math.abs(row.current), Math.abs(row.previous)]),
  );
  const hasNegative = rows.some((row) => row.current < 0 || row.previous < 0);
  const delta = r && baseline ? r.spend_cents - baseline.spend_cents : 0;
  return (
    <section id="overview" className="dashboard-overview">
      <header className="dashboard-heading">
        <div>
          <h1>Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Spending across your imported accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="dashboard-segments"
            role="group"
            aria-label="Report frequency"
          >
            {(["monthly", "quarterly", "yearly"] as const).map((view) => (
              <Button
                key={view}
                variant="ghost"
                aria-pressed={selection.view === view}
                onClick={() => changeView(view)}
              >
                {view[0].toUpperCase() + view.slice(1)}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            disabled={!r?.count}
            aria-label="Download transactions"
            onClick={() => {
              if (r)
                window.location.href =
                  "/api/export?" +
                  queryString({
                    start: r.start,
                    end: r.end,
                    ...(selection.account
                      ? { account: selection.account }
                      : {}),
                  });
            }}
          >
            <ArrowDownToLine />
            Export
          </Button>
        </div>
      </header>
      <div className="dashboard-filterbar">
        <span className="text-sm text-muted-foreground">Showing</span>
        <NativeSelect
          id="f-account"
          aria-label="Account"
          value={selection.account}
          onChange={(e) =>
            setReportSelection({ ...selection, account: e.target.value })
          }
        >
          <NativeSelectOption value="">All accounts</NativeSelectOption>
          {bootstrap.accounts.map((account) => (
            <NativeSelectOption key={account} value={account}>
              {account}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span className="text-sm text-muted-foreground">in</span>
        <Button
          variant="ghost"
          className="size-11 p-0"
          aria-label="Previous report period"
          disabled={!r}
          onClick={() =>
            r &&
            setReportSelection({ ...selection, period: shiftedPeriod(r, -1) })
          }
        >
          <ChevronLeft />
        </Button>
        <NativeSelect
          id="report-period"
          aria-label="Selected period"
          value={r?.period || selection.period}
          disabled={!r}
          onChange={(e) =>
            setReportSelection({ ...selection, period: e.target.value })
          }
        >
          {[...periods]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([key, label]) => (
              <NativeSelectOption key={key} value={key}>
                {label}
              </NativeSelectOption>
            ))}
        </NativeSelect>
        <Button
          variant="ghost"
          className="size-11 p-0"
          aria-label="Next report period"
          disabled={!r}
          onClick={() =>
            r &&
            setReportSelection({ ...selection, period: shiftedPeriod(r, 1) })
          }
        >
          <ChevronRight />
        </Button>
        {compare && (
          <>
            <span className="text-sm text-muted-foreground">vs</span>
            <NativeSelect
              id="compare-period"
              aria-label="Comparison period"
              value={comparePeriod}
              onChange={(e) =>
                setComparisonChoice({ anchor, period: e.target.value })
              }
            >
              {[...periods]
                .filter(([key]) => key !== r?.period)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([key, label]) => (
                  <NativeSelectOption key={key} value={key}>
                    {label}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </>
        )}
        <label className="dashboard-compare-toggle">
          <Checkbox
            checked={compare}
            onCheckedChange={(value) => {
              setCompare(!!value);
              if (!value && sort === "change") setSort("amount");
            }}
            aria-label="Compare periods"
          />
          Compare
        </label>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorMessage error={query.error} />
      ) : (
        r && (
          <div
            id="overview-content"
            data-report-period={r.period}
            data-report-view={r.view}
            className="space-y-5"
          >
            <article className="dashboard-summary">
              <div className="dashboard-summary-copy">
                <p className="text-sm text-muted-foreground">
                  Spent in {r.label}
                  {r.is_current ? " · In progress" : ""}
                </p>
                <strong className="metric">
                  {r.count ? money(r.spend_cents) : "—"}
                </strong>
                <p className="text-xs text-muted-foreground">
                  {r.spending_count} spending transactions ·{" "}
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs"
                    data-drill="spending"
                    disabled={!r.spending_count}
                    onClick={() => drill(r)}
                  >
                    View all
                  </Button>
                </p>
                {compare && (
                  <div
                    className="dashboard-summary-change"
                    data-comparison-change
                  >
                    {comparison.isPending ? (
                      <p className="text-xs text-muted-foreground">
                        Loading comparison…
                      </p>
                    ) : comparison.error ? (
                      <ErrorMessage error={comparison.error} />
                    ) : comparable && baseline ? (
                      <>
                        <div
                          className={`dashboard-change-pill ${delta < 0 ? "is-lower" : delta > 0 ? "is-higher" : ""}`}
                        >
                          <Change
                            before={baseline.spend_cents}
                            after={r.spend_cents}
                            valid={true}
                          />
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                          {delta === 0
                            ? "Same spending as"
                            : delta < 0
                              ? "Less than"
                              : "More than"}{" "}
                          {baseline.label}, when you spent{" "}
                          <strong className="font-medium text-foreground">
                            {money(baseline.spend_cents)}
                          </strong>{" "}
                          across {baseline.spending_count} spending
                          transactions.
                        </p>
                        <span className="sr-only">
                          {delta === 0
                            ? "No change"
                            : `${money(Math.abs(delta))} ${delta > 0 ? "more" : "less"}`}{" "}
                          in {r.label}
                          {baseline.spend_cents > 0
                            ? ` (${((delta / baseline.spend_cents) * 100).toFixed(1)}%)`
                            : ""}
                        </span>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Import statements for both periods to compare spending.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="dashboard-history">
                <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    Last {r.series.length}{" "}
                    {r.view === "monthly"
                      ? "months"
                      : r.view === "quarterly"
                        ? "quarters"
                        : "years"}
                  </span>
                  <span className="flex gap-3">
                    <span className="dashboard-legend">
                      <i />
                      Selected
                    </span>
                    {compare && (
                      <span className="dashboard-legend compared">
                        <i />
                        Compared
                      </span>
                    )}
                  </span>
                </div>
                <div className="dashboard-history-scroll">
                  <SpendingBars
                    series={r.series}
                    average={null}
                    compact
                    comparedPeriod={compare ? comparePeriod : undefined}
                    onSelect={(period) =>
                      setReportSelection({ ...selection, period })
                    }
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Dashed labels: no imported data.
                </p>
              </div>
            </article>
            <article className="dashboard-categories">
              <header className="dashboard-category-heading">
                <div>
                  <h2>By category</h2>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="dashboard-legend">
                      <i />
                      {r.label}
                    </span>
                    {compare && (
                      <span className="dashboard-legend compared">
                        <i />
                        {baseline?.label || comparePeriod}
                      </span>
                    )}
                  </div>
                </div>
                <div className="dashboard-segments" aria-label="Category order">
                  {(
                    [
                      ["change", "Biggest change"],
                      ["amount", "Most spent"],
                      ["name", "A–Z"],
                    ] as const
                  )
                    .filter(([key]) => compare || key !== "change")
                    .map(([key, label]) => (
                      <Button
                        key={key}
                        variant="ghost"
                        aria-pressed={sort === key}
                        onClick={() => setSort(key)}
                      >
                        {label}
                      </Button>
                    ))}
                </div>
              </header>
              <div className="dashboard-category-scroll">
                <table className="dashboard-category-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th aria-label="Spending bars" />
                      <th>{r.label}</th>
                      {compare && (
                        <>
                          <th>{baseline?.label || comparePeriod}</th>
                          <th>Change</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.name} data-comparison-category={row.name}>
                        <th scope="row">
                          <Button
                            variant="link"
                            className="px-0 text-foreground"
                            data-drill="category"
                            onClick={() => drill(r, { category: row.name })}
                          >
                            {row.name}
                          </Button>
                        </th>
                        <td className="category-bars-cell">
                          <CategoryComparisonBars
                            name={row.name}
                            selected={row.current}
                            compared={
                              compare && baseline?.count
                                ? row.previous
                                : undefined
                            }
                            maximum={maximum}
                            hasNegative={hasNegative}
                          />
                        </td>
                        <td data-label={r.label}>
                          <Button
                            variant="link"
                            className="px-0 text-foreground tabular-nums"
                            disabled={
                              !r.categories.some((c) => c.name === row.name)
                            }
                            aria-label={`View ${row.name} transactions for ${r.label}`}
                            onClick={() => drill(r, { category: row.name })}
                          >
                            {r.count ? money(row.current) : "—"}
                          </Button>
                        </td>
                        {compare && (
                          <>
                            <td data-label={baseline?.label || comparePeriod}>
                              <Button
                                variant="link"
                                className="px-0 text-muted-foreground tabular-nums"
                                disabled={
                                  !baseline?.categories.some(
                                    (c) => c.name === row.name,
                                  )
                                }
                                aria-label={`View ${row.name} comparison transactions`}
                                onClick={() =>
                                  baseline &&
                                  drill(baseline, { category: row.name })
                                }
                              >
                                {baseline?.count ? money(row.previous) : "—"}
                              </Button>
                            </td>
                            <td data-label="Change">
                              <Change
                                before={row.previous}
                                after={row.current}
                                valid={comparable}
                              />
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <td />
                      <td data-label={r.label}>
                        {r.count ? money(r.spend_cents) : "—"}
                      </td>
                      {compare && (
                        <>
                          <td data-label={baseline?.label || comparePeriod}>
                            {baseline?.count
                              ? money(baseline.spend_cents)
                              : "—"}
                          </td>
                          <td data-label="Change">
                            <Change
                              before={baseline?.spend_cents || 0}
                              after={r.spend_cents}
                              valid={comparable}
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!rows.length && (
                <p className="p-5 text-sm text-muted-foreground">
                  No spending transactions imported for this period.
                </p>
              )}
            </article>
            <details className="dashboard-details">
              <summary>
                Spending details &amp; category distribution{" "}
                <ChevronDown className="size-4" />
              </summary>
              <div className="spending-detail-content">
                <header className="spending-detail-heading">
                  <div>
                    <h2>Spending details</h2>
                    <p>
                      {r.start} – {r.end} · {r.spending_count} spending
                      transactions
                    </p>
                  </div>
                  <Button
                    disabled={!r.review_count}
                    onClick={() => {
                      apply({
                        start: r.start,
                        end: r.end,
                        review: "true",
                        ...(selection.account
                          ? { account: selection.account }
                          : {}),
                      });
                      void navigate({ to: "/transactions" });
                    }}
                  >
                    Review transactions <ArrowRight className="size-4" />
                  </Button>
                </header>
                <article className="spending-net-card">
                  <div className="spending-net-total">
                    <span>Net spending</span>
                    <strong>{money(r.spend_cents)}</strong>
                    <p>
                      {r.spending_count} transactions ·{" "}
                      <button onClick={() => drill(r)}>View all</button>
                    </p>
                  </div>
                  <dl>
                    {(
                      [
                        ["Purchases", r.purchases_cents],
                        ["Refunds", r.refunds_cents],
                        ["Fees", r.fees_cents],
                        ["Interest", r.interest_cents],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{money(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
                {r.unclassified_credit_cents !== 0 && (
                  <p className="text-sm text-muted-foreground">
                    {money(Math.abs(r.unclassified_credit_cents))} in
                    unclassified credits is excluded until reviewed.
                  </p>
                )}
                <div className="spending-detail-grid">
                  <article className="spending-category-card">
                    <header>
                      <h3>By category</h3>
                      <span>{r.categories.length} categories</span>
                    </header>
                    <div className="spending-donut-wrap">
                      {r.donut_total_cents > 0 ? (
                        <CategoryDonut
                          categories={r.categories}
                          total={r.donut_total_cents}
                          positiveOnly={r.donut_uses_positive_balances}
                          onSelect={(category) => drill(r, { category })}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No positive category balances for this period.
                        </p>
                      )}
                    </div>
                    <ul className="spending-category-legend">
                      {r.categories.map((category) => (
                        <li key={category.name}>
                          <button
                            data-drill="category"
                            onClick={() =>
                              drill(r, { category: category.name })
                            }
                          >
                            <i
                              className={`category-dot ${categoryColor(category.name)}`}
                            />
                            {category.name}
                          </button>
                          <span>
                            {category.percent === null
                              ? "—"
                              : category.percent + "%"}
                          </span>
                          <strong>{money(category.amount_cents)}</strong>
                        </li>
                      ))}
                    </ul>
                    {r.donut_uses_positive_balances && (
                      <p className="spending-distribution-note">
                        Percent of positive balances. Net spending includes
                        category credits.
                      </p>
                    )}
                  </article>
                  <article className="spending-merchants-card">
                    <header>
                      <h3>Top merchants</h3>
                      {r.vendors.length > 6 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-expanded={showAllMerchants}
                          onClick={() => setShowAllMerchants(!showAllMerchants)}
                        >
                          {showAllMerchants
                            ? "Show top 6"
                            : "Show all " + r.vendors.length}
                          <ChevronDown className="size-3" />
                        </Button>
                      )}
                    </header>
                    <div className="spending-merchant-labels">
                      <span>Merchant</span>
                      <span>Share of spending</span>
                      <span>Amount</span>
                    </div>
                    <ul className="spending-merchant-list">
                      {r.vendors
                        .slice(0, showAllMerchants ? 12 : 6)
                        .map((vendor) => {
                          const share =
                            r.spend_cents > 0
                              ? (vendor.amount_cents / r.spend_cents) * 100
                              : null;
                          const maximum = Math.max(
                            1,
                            ...r.vendors.map((v) => Math.abs(v.amount_cents)),
                          );
                          return (
                            <li key={vendor.name}>
                              <div>
                                <button
                                  data-drill="merchant"
                                  onClick={() =>
                                    drill(r, { vendor: vendor.name })
                                  }
                                >
                                  {vendor.name}
                                </button>
                                <small>
                                  {vendor.transaction_count}{" "}
                                  {vendor.transaction_count === 1
                                    ? "transaction"
                                    : "transactions"}
                                </small>
                              </div>
                              <div className="spending-merchant-share">
                                <div className="spending-share-track">
                                  <span
                                    style={{
                                      width:
                                        (Math.abs(vendor.amount_cents) /
                                          maximum) *
                                          100 +
                                        "%",
                                    }}
                                  />
                                </div>
                                <span>
                                  {share === null
                                    ? "—"
                                    : share.toFixed(1) + "%"}
                                </span>
                              </div>
                              <strong>{money(vendor.amount_cents)}</strong>
                            </li>
                          );
                        })}
                    </ul>
                    {!r.vendors.length && (
                      <p className="p-5 text-sm text-muted-foreground">
                        No spending merchants for this period.
                      </p>
                    )}
                    <footer>
                      <strong>Top {r.vendors.length} total</strong>
                      <span>
                        {r.spend_cents > 0
                          ? (
                              (r.vendors.reduce(
                                (sum, v) => sum + v.amount_cents,
                                0,
                              ) /
                                r.spend_cents) *
                              100
                            ).toFixed(1) + "% of spending"
                          : "—"}
                      </span>
                      <strong>
                        {money(
                          r.vendors.reduce((sum, v) => sum + v.amount_cents, 0),
                        )}
                      </strong>
                    </footer>
                  </article>
                </div>
              </div>
            </details>
            <p className="text-xs text-muted-foreground">
              Totals reflect imported transactions only. Periods marked “In
              progress” may be incomplete. Payments, transfers and income are
              excluded. Category bars include signed refunds.
            </p>
          </div>
        )
      )}
    </section>
  );
}
