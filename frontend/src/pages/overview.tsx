import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { api, money, queryString } from "@/lib/api";
import { useLedger } from "@/lib/state";
import type { ReportView, SpendingReport, SpendingCategory } from "@/lib/types";
import { ErrorMessage, Loading, Field } from "@/components/shared";
import {
  CategoryDonut,
  SpendingBars,
  categoryColor,
} from "@/components/spending-charts";

export function Overview() {
  const {
      bootstrap,
      reportSelection: selection,
      setReportSelection,
      apply,
    } = useLedger(),
    navigate = useNavigate();
  const [sort, setSort] = useState<{
    key: "name" | "amount";
    ascending: boolean;
  }>({ key: "amount", ascending: false });
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
  const r = query.data;
  const scope = r
    ? {
        start: r.start,
        end: r.end,
        ...(selection.account ? { account: selection.account } : {}),
      }
    : {};
  function drill(extra: Record<string, string> = {}) {
    apply({ ...scope, spending: "true", ...extra });
    void navigate({ to: "/transactions" });
  }
  function changeView(view: ReportView) {
    const anchor =
      selection.period ||
      r?.period ||
      new Date().getFullYear().toString() +
        "-" +
        String(new Date().getMonth() + 1).padStart(2, "0");
    const year = anchor.slice(0, 4);
    const month =
      selection.view === "monthly"
        ? Number(anchor.slice(5, 7))
        : selection.view === "quarterly"
          ? Number(anchor.slice(-1)) * 3
          : 12;
    const period =
      view === "yearly"
        ? year
        : view === "quarterly"
          ? year + "-Q" + Math.ceil(month / 3)
          : year + "-" + String(month).padStart(2, "0");
    setReportSelection({ ...selection, view, period });
  }
  const periods = new Map(
    (r?.available_periods || []).map((p) => [p.key, p.label]),
  );
  r?.series.forEach((p) => periods.set(p.key, p.label));
  if (r) periods.set(r.period, r.label);
  const categories = [...(r?.categories || [])].sort((a, b) => {
    const value =
      sort.key === "name"
        ? a.name.localeCompare(b.name)
        : a.amount_cents - b.amount_cents;
    return (sort.ascending ? value : -value) || a.name.localeCompare(b.name);
  });
  function toggleSort(key: "name" | "amount") {
    setSort({
      key,
      ascending: sort.key === key ? !sort.ascending : key === "name",
    });
  }
  function categoryRow(c: SpendingCategory) {
    return (
      <tr key={c.name}>
        <td>
          <Button
            variant="link"
            className={categoryColor(c.name) + " category-link"}
            data-drill="category"
            onClick={() => drill({ category: c.name })}
          >
            <span className="category-dot" aria-hidden="true" />
            <span className="truncate">{c.name}</span>
            <ChevronRight className="size-4 shrink-0" />
          </Button>
        </td>
        <td className="text-right tabular-nums">{money(c.amount_cents)}</td>
        <td className="text-right tabular-nums">
          {c.percent === null ? "—" : c.percent.toFixed(1) + "%"}
        </td>
      </tr>
    );
  }
  return (
    <section id="overview" className="spending-report">
      <div className="report-toolbar">
        <div
          className="flex flex-wrap gap-1 border-b"
          role="group"
          aria-label="Report frequency"
        >
          {(["monthly", "quarterly", "yearly"] as const).map((view) => (
            <Button
              key={view}
              variant="ghost"
              className="report-tab"
              aria-pressed={selection.view === view}
              onClick={() => changeView(view)}
            >
              {view[0].toUpperCase() + view.slice(1)}
            </Button>
          ))}
          {r?.year_end_period && (
            <Button
              variant="ghost"
              className="report-tab"
              onClick={() =>
                setReportSelection({
                  ...selection,
                  view: "yearly",
                  period: r.year_end_period!,
                })
              }
            >
              {r.year_end_period} year-end summary
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          disabled={!r?.count}
          onClick={() => {
            window.location.href = "/api/export?" + queryString(scope);
          }}
        >
          <ArrowDownToLine className="size-4" />
          Download transactions
        </Button>
      </div>
      <div className="report-selectors">
        <Field id="f-account" label="Showing">
          <NativeSelect
            id="f-account"
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
        </Field>
        <Field id="report-period" label="Show">
          <NativeSelect
            id="report-period"
            value={selection.period || r?.period || ""}
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
        </Field>
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
            className="space-y-6"
          >
            <div className="report-main-grid">
              <article className="report-card report-summary">
                <h2>{r.label} spending</h2>
                <strong className="metric">
                  {r.count ? money(r.spend_cents) : "—"}
                </strong>
                <p className="text-muted-foreground">
                  {r.count
                    ? r.is_current
                      ? "Spent so far · imported transactions"
                      : "Net imported spending"
                    : "No imported transactions for this period"}
                </p>
                {r.change_cents !== null && (
                  <p className="mt-3 text-sm">
                    {r.change_cents === 0
                      ? "Same as "
                      : money(Math.abs(r.change_cents)) +
                        (r.change_cents > 0 ? " more than " : " less than ")}
                    {r.previous_label}
                    {r.change_percent !== null
                      ? " (" + Math.abs(r.change_percent).toFixed(1) + "%)"
                      : ""}
                  </p>
                )}
                <div className="mt-7">
                  <SpendingBars
                    series={r.series}
                    average={r.average_cents}
                    onSelect={(period) =>
                      setReportSelection({ ...selection, period })
                    }
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.average_cents !== null
                    ? "Dashed line: " +
                      money(r.average_cents) +
                      " average across " +
                      r.average_period_count +
                      " prior imported period(s)."
                    : "No prior imported periods to compare."}{" "}
                  Hatched bars have no imported transactions.
                </p>
                <Button
                  variant="link"
                  className="mt-4 justify-start px-0"
                  disabled={!r.spending_count}
                  data-drill="spending"
                  onClick={() => drill()}
                >
                  Spending
                  <ChevronRight className="size-4" />
                  <span className="ml-auto">{money(r.spend_cents)}</span>
                </Button>
              </article>
              <article className="report-card">
                <h2>{r.label} spending by category</h2>
                <div className="report-category-grid">
                  <div className="min-w-0 overflow-x-auto">
                    <table className="report-category-table">
                      <thead>
                        <tr>
                          <th
                            aria-sort={
                              sort.key === "name"
                                ? sort.ascending
                                  ? "ascending"
                                  : "descending"
                                : "none"
                            }
                          >
                            <Button
                              variant="ghost"
                              className="px-0"
                              onClick={() => toggleSort("name")}
                            >
                              Category
                              <ArrowUpDown className="size-3" />
                            </Button>
                          </th>
                          <th
                            className="text-right"
                            aria-sort={
                              sort.key === "amount"
                                ? sort.ascending
                                  ? "ascending"
                                  : "descending"
                                : "none"
                            }
                          >
                            <Button
                              variant="ghost"
                              className="px-0"
                              onClick={() => toggleSort("amount")}
                            >
                              <span className="hidden sm:inline">
                                Amount spent
                              </span>
                              <span className="sm:hidden">Amount</span>
                              <ArrowUpDown className="size-3" />
                            </Button>
                          </th>
                          <th className="text-right">
                            Percent
                            {r.donut_uses_positive_balances
                              ? " of positive balances"
                              : " of total"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>{categories.map(categoryRow)}</tbody>
                    </table>
                    {!categories.length && (
                      <p className="py-8 text-muted-foreground">
                        No spending transactions were imported for this period.
                      </p>
                    )}
                  </div>
                  <div className="mx-auto w-full max-w-[300px] self-center">
                    {r.spending_count ? (
                      <CategoryDonut
                        categories={r.categories}
                        total={r.donut_total_cents}
                        positiveOnly={r.donut_uses_positive_balances}
                        onSelect={(category) => drill({ category })}
                      />
                    ) : (
                      <div className="flex min-h-40 items-center justify-center text-muted-foreground">
                        No category data
                      </div>
                    )}
                  </div>
                </div>
                {r.donut_uses_positive_balances && r.spending_count > 0 && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Negative category balances are net credits. The donut and
                    percentages show positive category balances only; net
                    spending above includes credits.
                  </p>
                )}
              </article>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="report-card">
                <h2>Spending details</h2>
                <dl className="space-y-3">
                  {[
                    ["Purchases", r.purchases_cents],
                    ["Refunds", r.refunds_cents],
                    ["Fees", r.fees_cents],
                    ["Interest", r.interest_cents],
                    ["Net spending", r.spend_cents],
                  ].map(([label, value]) => (
                    <div
                      className="flex justify-between gap-3 border-b pb-2"
                      key={label}
                    >
                      <dt>{label}</dt>
                      <dd className="tabular-nums">{money(Number(value))}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span>
                    {r.spending_count} spending transactions · {r.count} total
                    transactions
                  </span>
                  <Button
                    variant="link"
                    className="px-0"
                    disabled={!r.review_count}
                    onClick={() => {
                      apply({ ...scope, review: "true" });
                      void navigate({ to: "/transactions" });
                    }}
                  >
                    Review {r.review_count} transactions
                  </Button>
                </div>
                {r.unclassified_credit_cents !== 0 && (
                  <p className="mt-3 rounded-md bg-secondary p-3 text-sm">
                    {money(Math.abs(r.unclassified_credit_cents))} in
                    unclassified credits is excluded from spending until
                    reviewed.
                  </p>
                )}
              </article>
              <article className="report-card">
                <h2>Top merchants</h2>
                {r.vendors.length ? (
                  r.vendors.map((v) => (
                    <div
                      key={v.name}
                      className="flex items-center justify-between gap-3 border-b py-2"
                    >
                      <Button
                        variant="link"
                        className="min-w-0 truncate px-0"
                        data-drill="merchant"
                        onClick={() => drill({ vendor: v.name })}
                      >
                        {v.name}
                        <ChevronRight className="size-4" />
                      </Button>
                      <span className="shrink-0 tabular-nums">
                        {money(v.amount_cents)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    No spending merchants in this period.
                  </p>
                )}
              </article>
            </div>
            <div className="report-coverage">
              <p>
                {r.imported_through
                  ? "Imported transaction dates: " +
                    r.imported_start +
                    " through " +
                    r.imported_through +
                    "."
                  : "Choose another period or upload and approve a statement."}
              </p>
              <p>
                Calendar dates: {r.start} through {r.end}. Reports include only
                approved imports. Missing accounts, days, and statements are not
                estimated. Payments, transfers, and income are excluded from
                spending.
              </p>
            </div>
          </div>
        )
      )}
    </section>
  );
}
