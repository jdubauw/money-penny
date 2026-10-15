import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NativeSelect } from "@/components/ui/native-select/native-select";
import { NativeSelectOption } from "@/components/ui/native-select/native-select-option";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/field";
import { Loading } from "@/components/loading";
import { ErrorMessage } from "@/components/error-message";
import { api, money, queryString } from "@/lib/api";
import type { SpendingReport } from "@/lib/types";

export function SpendingComparison({
  current,
  account,
  onDrill,
}: {
  current: SpendingReport;
  account: string;
  onDrill: (report: SpendingReport, category?: string) => void;
}) {
  const anchor = new Date(current.start + "T12:00:00");
  anchor.setMonth(
    anchor.getMonth() -
      (current.view === "monthly" ? 1 : current.view === "quarterly" ? 3 : 12),
  );
  const year = anchor.getFullYear();
  const previous =
    current.view === "yearly"
      ? String(year)
      : current.view === "quarterly"
        ? `${year}-Q${Math.ceil((anchor.getMonth() + 1) / 3)}`
        : `${year}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState(previous);
  const query = useQuery({
    queryKey: ["reports", "comparison", current.view, period, account],
    queryFn: ({ signal }) =>
      api<SpendingReport>(
        "/api/reports/spending?" +
          queryString({ view: current.view, period, account }),
        { signal },
      ),
  });
  const baseline = query.data;
  const options = new Map(
    current.available_periods.map((p) => [p.key, p.label]),
  );
  current.series.forEach((p) => options.set(p.key, p.label));
  options.set(
    previous,
    baseline?.period === previous ? baseline.label : previous,
  );
  if (baseline) options.set(baseline.period, baseline.label);
  const comparable = !!baseline?.count && current.count > 0;
  function difference(before: number, after: number) {
    const delta = after - before;
    return delta === 0
      ? "No change"
      : `${money(Math.abs(delta))} ${delta > 0 ? "more" : "less"}`;
  }
  const names = new Set([
    ...current.categories.map((c) => c.name),
    ...(baseline?.categories.map((c) => c.name) || []),
  ]);
  const rows = [...names]
    .map((name) => ({
      name,
      before:
        baseline?.categories.find((c) => c.name === name)?.amount_cents || 0,
      after: current.categories.find((c) => c.name === name)?.amount_cents || 0,
    }))
    .sort(
      (a, b) =>
        Math.abs(b.after - b.before) - Math.abs(a.after - a.before) ||
        a.name.localeCompare(b.name),
    );
  return (
    <section
      className="report-card mb-6"
      id="spending-comparison"
      aria-label="Spending comparison"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2>Compare spending</h2>
          <p className="text-sm text-muted-foreground">
            Same account selection, side by side.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Field id="compare-period" label="Compare selected period with">
            <NativeSelect
              id="compare-period"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              {[...options]
                .filter(([key]) => key !== current.period)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([key, label]) => (
                  <NativeSelectOption key={key} value={key}>
                    {label}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
        </div>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorMessage error={query.error} />
      ) : (
        baseline && (
          <>
            <div className="grid grid-cols-2 gap-4">
              {[baseline, current].map((report) => (
                <div className="min-w-0" key={report.period}>
                  <p className="text-sm font-medium">{report.label}</p>
                  <strong
                    className={`metric comparison-total mt-2 ${money(report.spend_cents).length > 12 ? "long-amount" : ""}`}
                  >
                    {report.count ? money(report.spend_cents) : "—"}
                  </strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {report.count
                      ? `${report.spending_count} spending transactions`
                      : "No imported transactions"}
                  </p>
                  <Button
                    variant="link"
                    className="px-0 text-xs"
                    disabled={!report.spending_count}
                    onClick={() => onDrill(report)}
                  >
                    View transactions
                  </Button>
                </div>
              ))}
            </div>
            <p className="my-4 border-y py-4 text-sm" data-comparison-change>
              {comparable ? (
                <>
                  {difference(baseline.spend_cents, current.spend_cents)} in{" "}
                  {current.label}
                  {baseline.spend_cents > 0
                    ? ` (${(((current.spend_cents - baseline.spend_cents) / baseline.spend_cents) * 100).toFixed(1)}%)`
                    : " · percentage unavailable for a zero or negative baseline"}
                </>
              ) : (
                "Import statements for both periods to compare spending."
              )}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              Changes show the selected period relative to the comparison
              period. Current periods may be incomplete; totals reflect imported
              transactions only.
            </p>
            <div
              className="comparison-row comparison-header hidden md:grid"
              aria-hidden="true"
            >
              <span>Category</span>
              <span>{baseline.label}</span>
              <span>{current.label}</span>
              <span>Change</span>
            </div>
            {rows.map((row) => (
              <div
                key={row.name}
                className="comparison-row border-t py-3"
                data-comparison-category={row.name}
              >
                <span className="comparison-name text-sm font-medium">
                  {row.name}
                </span>
                {[
                  { report: baseline, value: row.before },
                  { report: current, value: row.after },
                ].map(({ report, value }) => (
                  <div className="min-w-0" key={report.period}>
                    <span className="block text-xs text-muted-foreground md:hidden">
                      {report.label}
                    </span>
                    <Button
                      variant="link"
                      className="h-11 px-0 tabular-nums"
                      disabled={
                        !report.categories.some((c) => c.name === row.name)
                      }
                      aria-label={`View ${row.name} transactions for ${report.label}`}
                      onClick={() => onDrill(report, row.name)}
                    >
                      {report.count ? money(value) : "—"}
                    </Button>
                  </div>
                ))}
                <span className="comparison-delta text-xs text-muted-foreground">
                  {comparable
                    ? difference(row.before, row.after)
                    : "Comparison unavailable"}
                </span>
              </div>
            ))}
            {!rows.length && (
              <p className="py-4 text-sm text-muted-foreground">
                No spending categories in either period.
              </p>
            )}
          </>
        )
      )}
    </section>
  );
}
