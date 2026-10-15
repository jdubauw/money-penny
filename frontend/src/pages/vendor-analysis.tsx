import { ReportFilters } from "@/components/report-filters";
import { DataTable } from "@/components/data-table";
import { useTableSort } from "@/hooks/use-table-sort";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/error-message";
import { Loading } from "@/components/loading";
import { api, money, queryString } from "@/lib/api";
import { useLedger } from "@/lib/state";
import { type Vendor } from "@/lib/report-types";
import { useReportFilters } from "@/hooks/use-report-filters";
import { csvDownload } from "@/lib/csv-download";

export function VendorAnalysis() {
  const filterState = useReportFilters();
  const { filters } = filterState,
    { apply } = useLedger(),
    navigate = useNavigate();
  const [split, setSplit] = useState(false);
  const vendorSort = useTableSort<Vendor, keyof Vendor>(
    { key: "spend_cents", direction: "desc" },
    {
      vendor: (r) => r.vendor,
      category: (r) => r.category,
      account: (r) => r.account || r.accounts.join(", "),
      accounts: (r) => r.accounts.join(", "),
      spend_cents: (r) => r.spend_cents,
      count: (r) => r.count,
      average_cents: (r) => r.average_cents,
      largest_cents: (r) => r.largest_cents,
    },
  );
  const query = useQuery({
    queryKey: ["reports", "vendors", filters, split],
    queryFn: ({ signal }) =>
      api<Vendor[]>(
        "/api/reports/vendors?" +
          queryString(filters, { split: String(split) }),
        { signal },
      ),
  });
  const rows = vendorSort.sorted(query.data || []);
  const headings: [keyof Vendor, string][] = [
    ["vendor", "Vendor"],
    ["category", "Category"],
    ["account", "Account"],
    ["spend_cents", "Net spend"],
    ["count", "Transactions"],
    ["average_cents", "Average purchase"],
    ["largest_cents", "Largest purchase"],
  ];
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Vendor analysis</h1>
          <p className="mt-2 text-muted-foreground">
            See where your money goes, across every vendor.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!rows.length}
          onClick={() =>
            csvDownload(
              headings.map((h) => h[1]),
              rows.map((r) => [
                r.vendor,
                r.category,
                r.account || r.accounts.join(", "),
                r.spend_cents / 100,
                r.count,
                r.average_cents === null ? null : r.average_cents / 100,
                r.largest_cents === null ? null : r.largest_cents / 100,
              ]),
              "vendor-analysis.csv",
            )
          }
        >
          Export CSV
        </Button>
      </div>
      <ReportFilters
        state={filterState}
        status={
          query.data
            ? `${rows.length} vendor rows · ${money(rows.reduce((s, r) => s + r.spend_cents, 0))} net spend`
            : "Loading vendors…"
        }
      >
        <Label>
          <Checkbox
            checked={split}
            onCheckedChange={(v) => setSplit(v === true)}
          />
          Break down by account and category
        </Label>
      </ReportFilters>
      <ErrorMessage error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        query.data && (
          <>
            <DataTable
              rows={rows}
              columns={headings.map(([key, label]) => ({
                key,
                label,
                numeric: [
                  "spend_cents",
                  "count",
                  "average_cents",
                  "largest_cents",
                ].includes(key),
                render: (r: Vendor) =>
                  key === "vendor" ? (
                    <button
                      type="button"
                      className="data-drill-link"
                      onClick={() => {
                        apply({
                          ...filters,
                          vendor: r.vendor,
                          spending: "true",
                          ...(split
                            ? { account: r.account, category: r.category }
                            : {}),
                        });
                        void navigate({ to: "/transactions" });
                      }}
                    >
                      {r.vendor}
                    </button>
                  ) : key === "account" ? (
                    r.account || r.accounts.join(", ")
                  ) : key === "category" ? (
                    r.category
                  ) : key === "count" ? (
                    r.count
                  ) : r[key] === null ? (
                    "—"
                  ) : (
                    money(r[key] as number)
                  ),
              }))}
              rowKey={(r) => JSON.stringify([r.vendor, r.account, r.category])}
              sort={vendorSort.sort}
              onSort={vendorSort.onSort}
              empty="No spending transactions match these filters."
            />
          </>
        )
      )}
      <p className="text-sm text-muted-foreground">
        Net spend includes purchases, refunds, fees, and interest. Average and
        largest purchase use positive purchases only. Click a vendor to inspect
        its transactions.
      </p>
    </section>
  );
}
