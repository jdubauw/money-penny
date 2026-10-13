import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { api, money, queryString } from "@/lib/api";
import { useLedger } from "@/lib/state";
import type { Report } from "@/lib/types";
import { ErrorMessage, Loading } from "@/components/shared";
export function Overview() {
  const { filters, apply } = useLedger(),
    navigate = useNavigate();
  const query = useQuery({
    queryKey: ["reports", filters],
    queryFn: ({ signal }) =>
      api<Report>("/api/reports?" + queryString(filters), { signal }),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorMessage error={query.error} />;
  const r = query.data;
  function drill(type: string, value: string) {
    const next = { ...filters };
    if (type === "category") next.category = value;
    else if (type === "merchant") next.vendor = value;
    else {
      const [year, month] = value.split("-").map(Number);
      const start = value + "-01",
        end = value + "-" + new Date(year, month, 0).getDate();
      next.start = [next.start, start].filter(Boolean).sort().at(-1)!;
      next.end = [next.end, end].filter(Boolean).sort()[0];
    }
    apply(next);
    void navigate({ to: "/transactions" });
  }
  function bars(items: [string, number][], type: string) {
    const max = Math.max(1, ...items.map(([, v]) => Math.abs(v)));
    return items.length ? (
      items.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b py-2"
        >
          <Button
            variant="link"
            className="justify-start truncate px-0"
            data-drill={type}
            onClick={() => drill(type, label)}
          >
            {label}
          </Button>
          <span className="tabular-nums">{money(value)}</span>
          <progress
            className="col-span-2 h-1 w-full"
            value={Math.abs(value)}
            max={max}
            aria-label={`${label} spending`}
          />
        </div>
      ))
    ) : (
      <p className="text-muted-foreground">
        No spending transactions match these filters.
      </p>
    );
  }
  return (
    <section id="overview">
      <div id="overview-content">
        {r.count ? (
          <>
            <div className="grid gap-6 border-y py-6 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Net spending</p>
                <strong className="metric">{money(r.spend_cents)}</strong>
                <p className="text-sm text-muted-foreground">
                  Purchases, fees, interest, less refunds
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Transactions</p>
                <strong className="metric">{r.count.toLocaleString()}</strong>
                <p className="text-sm text-muted-foreground">
                  {r.date_start} through {r.date_end}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Needs review</p>
                <strong className="metric">
                  {r.review_count.toLocaleString()}
                </strong>
                <Button
                  variant="link"
                  className="px-0"
                  onClick={() => {
                    apply({ ...filters, review: "true" });
                    void navigate({ to: "/transactions" });
                  }}
                >
                  Review transactions →
                </Button>
              </div>
            </div>
            {!!r.unclassified_credit_cents && (
              <p className="mt-4 rounded-md bg-secondary p-4">
                {money(Math.abs(r.unclassified_credit_cents))} in unclassified
                credits is excluded from spending. Review the transaction types.
              </p>
            )}
            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div>
                <h2>Spending by category</h2>
                {bars(r.categories, "category")}
              </div>
              <div>
                <h2>Monthly spending</h2>
                {bars(r.months, "month")}
              </div>
              <div>
                <h2>Top merchants</h2>
                {bars(r.vendors, "merchant")}
              </div>
              <div>
                <h2>Report coverage</h2>
                <p className="text-muted-foreground">
                  {r.statement_ranges.length} committed statement export(s).
                  Missing months and accounts are not estimated.
                </p>
                <p className="my-4">Income recorded: {money(r.income_cents)}</p>
                <p className="text-muted-foreground">
                  Payments and transfers are excluded. General credits stay
                  separate until classified. Charts show net spending.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4 py-8">
            <h2>
              {Object.keys(filters).length
                ? "No matching transactions"
                : "Start with a statement"}
            </h2>
            <p className="text-muted-foreground">
              Upload a CSV or supported PDF, or adjust your filters.
            </p>
            <Button
              onClick={() =>
                Object.keys(filters).length
                  ? apply({})
                  : void navigate({ to: "/imports" })
              }
            >
              {Object.keys(filters).length
                ? "Reset filters"
                : "Upload statement"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
