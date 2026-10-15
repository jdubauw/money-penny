import { ReportFilters } from "@/components/report-filters";
import { DataTable } from "@/components/data-table";
import { useTableSort } from "@/hooks/use-table-sort";
import { type DataColumn } from "@/lib/table-types";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/error-message";
import { Loading } from "@/components/loading";
import { api, money, queryString } from "@/lib/api";
import { useLedger } from "@/lib/state";
import { type Service } from "@/lib/report-types";
import { type Target } from "@/lib/report-types";
import { type Savings } from "@/lib/report-types";
import { useReportFilters } from "@/hooks/use-report-filters";
import { csvDownload } from "@/lib/csv-download";
import { ServiceEditor } from "@/components/service-editor";
import { TargetEditor } from "@/components/target-editor";

export function SavingsOpportunities() {
  const filterState = useReportFilters();
  const { filters } = filterState,
    { apply } = useLedger(),
    navigate = useNavigate(),
    client = useQueryClient();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const query = useQuery({
    queryKey: ["reports", "savings", filters],
    queryFn: ({ signal }) =>
      api<Savings>("/api/reports/savings?" + queryString(filters), { signal }),
  });
  const refresh = () => {
    setEditing(null);
    void client.invalidateQueries({ queryKey: ["reports", "savings"] });
  };
  const target = useMutation({
    mutationFn: ({
      category,
      percent,
    }: {
      category: string;
      percent: number;
    }) =>
      api("/api/reports/savings/target", {
        method: "PUT",
        body: { category, percent },
      }),
    onSuccess: refresh,
  });
  const serviceSort = useTableSort<
    Service,
    | "vendor"
    | "category"
    | "cadence"
    | "decision"
    | "spend_cents"
    | "months_charged"
    | "last_charge"
    | "annual_cents"
    | "savings_cents"
  >(
    { key: "vendor", direction: "asc" },
    {
      vendor: (r) => r.vendor,
      category: (r) => r.category,
      cadence: (r) => r.cadence,
      decision: (r) => r.decision,
      spend_cents: (r) => r.spend_cents,
      months_charged: (r) => r.months_charged,
      last_charge: (r) => r.last_charge,
      annual_cents: (r) => r.annual_cents,
      savings_cents: (r) => r.savings_cents,
    },
  );
  const targetSort = useTableSort<Target, keyof Target>(
    { key: "category", direction: "asc" },
    {
      category: (r) => r.category,
      spend_cents: (r) => r.spend_cents,
      annual_cents: (r) => r.annual_cents,
      percent: (r) => r.percent,
      savings_cents: (r) => r.savings_cents,
    },
  );
  const data = query.data;
  const serviceColumns: DataColumn<Service, typeof serviceSort.sort.key>[] = [
    {
      key: "vendor",
      label: "Service",
      render: (s) => (
        <>
          <button
            type="button"
            className="data-drill-link"
            aria-label={`View transactions for ${s.vendor}`}
            onClick={() => {
              apply({ ...filters, vendor: s.vendor, spending: "true" });
              void navigate({ to: "/transactions" });
            }}
          >
            {s.vendor}
          </button>
          <small className="block text-muted-foreground">
            {s.confirmed ? "Confirmed" : "Needs confirmation"}
          </small>
        </>
      ),
    },
    { key: "category", label: "Category", render: (s) => s.category || "—" },
    { key: "cadence", label: "Cadence", render: (s) => s.cadence },
    { key: "decision", label: "Decision", render: (s) => s.decision },
    {
      key: "spend_cents",
      label: "Period spend",
      numeric: true,
      render: (s) => money(s.spend_cents),
    },
    {
      key: "months_charged",
      label: "Months charged",
      numeric: true,
      render: (s) => s.months_charged,
    },
    {
      key: "last_charge",
      label: "Last charge",
      render: (s) => s.last_charge || "—",
    },
    {
      key: "annual_cents",
      label: "Annual cost",
      numeric: true,
      render: (s) => money(s.annual_cents),
    },
    {
      key: "savings_cents",
      label: "Potential savings",
      numeric: true,
      render: (s) => money(s.savings_cents),
    },
  ];
  const targetColumns: DataColumn<Target, keyof Target>[] = [
    { key: "category", label: "Category", render: (t) => t.category },
    {
      key: "spend_cents",
      label: "Period spend",
      numeric: true,
      render: (t) => money(t.spend_cents),
    },
    {
      key: "annual_cents",
      label: "Annual baseline",
      numeric: true,
      render: (t) => money(t.annual_cents),
    },
    {
      key: "percent",
      label: "Reduction target",
      render: (t) => (
        <TargetEditor
          key={`${t.category}:${t.percent}`}
          target={t}
          pending={target.isPending}
          save={(category, percent) => target.mutate({ category, percent })}
        />
      ),
    },
    {
      key: "savings_cents",
      label: "Annual savings",
      numeric: true,
      render: (t) => money(t.savings_cents),
    },
  ];
  const exportSavings = () => {
    if (!data) return;
    csvDownload(
      [
        "Section",
        "Service or category",
        "Cadence",
        "Decision",
        "Confirmed",
        "Period spend",
        "Annual baseline",
        "Reduction percent",
        "Annual savings",
      ],
      [
        ...serviceSort
          .sorted(data.services)
          .map((s) => [
            "Subscription",
            s.vendor,
            s.cadence,
            s.decision,
            s.confirmed ? "Yes" : "No",
            s.spend_cents / 100,
            s.annual_cents / 100,
            "",
            s.savings_cents / 100,
          ]),
        ...targetSort
          .sorted(data.targets)
          .map((t) => [
            "Category",
            t.category,
            "",
            "",
            "",
            t.spend_cents / 100,
            t.annual_cents / 100,
            t.percent,
            t.savings_cents / 100,
          ]),
      ],
      "savings-opportunities.csv",
    );
  };
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Savings opportunities</h1>
          <p className="mt-2 text-muted-foreground">
            Review recurring services and explore spending reductions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!data} onClick={exportSavings}>
            Export CSV
          </Button>
          <Button onClick={() => setEditing("new")}>Add subscription</Button>
        </div>
      </div>
      <ReportFilters
        state={filterState}
        status={
          data
            ? `${data.services.length} services · ${data.observed_months} observed months`
            : "Loading savings…"
        }
      />
      <ErrorMessage error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="report-editor">
              <p className="text-sm text-muted-foreground">
                Potential annual savings
              </p>
              <strong className="text-3xl">
                {money(data.total_savings_cents)}
              </strong>
              <p className="text-sm text-muted-foreground">
                Confirmed services marked Cancel plus saved category targets.
                These are estimates, not realized savings.
              </p>
            </div>
            {editing && (
              <ServiceEditor
                key={editing === "new" ? "new" : editing.vendor}
                service={editing === "new" ? undefined : editing}
                done={refresh}
              />
            )}
            <div>
              <h2 className="text-xl font-semibold">Subscriptions</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Suggestions require a recognized subscription service or
                purchases explicitly categorized as Subscriptions, plus a
                monthly billing pattern. Repeated shopping and dining purchases
                do not qualify on timing alone. Recognized annual memberships
                also appear for review. Confirm the cadence and price before
                counting savings. Saved services remain visible across filters;
                add other services manually. No services are canceled by this
                app.
              </p>
            </div>
            <DataTable
              rows={serviceSort.sorted(data.services)}
              columns={serviceColumns}
              rowKey={(s) => s.vendor}
              sort={serviceSort.sort}
              onSort={serviceSort.onSort}
              empty="No recurring-charge suggestions yet. Add a service manually or import more statements."
              actions={(s) => (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(s)}
                >
                  Edit
                </Button>
              )}
            />
            <div>
              <h2 className="text-xl font-semibold">Category targets</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Annual baseline = net spending ÷{" "}
                {data.observed_months || "observed"} months with imported
                transactions × 12. Confirmed subscriptions are excluded. Each
                category target is saved across reports.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Observed transactions: {data.observed_start || "—"} through{" "}
                {data.observed_end || "—"}. Missing statements and partial
                months can distort these projections; check your imports before
                relying on them.
              </p>
            </div>
            <ErrorMessage error={target.error} />
            {data.missing_months.length > 0 && (
              <p className="rounded border p-3 text-sm" role="status">
                No imported transactions for {data.missing_months.join(", ")}.
                These months are excluded from the annual baseline calculation.
              </p>
            )}
            <DataTable
              rows={targetSort.sorted(data.targets)}
              columns={targetColumns}
              rowKey={(t) => t.category}
              sort={targetSort.sort}
              onSort={targetSort.onSort}
              empty="No category spending in this period."
            />
          </>
        )
      )}
    </section>
  );
}
