import {
  FilterPanel,
  FilterFields,
  FilterFooter,
} from "@/components/filter-panel";
import {
  DataTable,
  useTableSort,
  type DataColumn,
} from "@/components/data-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  ErrorMessage,
  Loading,
  SelectField,
  TextField,
} from "@/components/shared";
import { api, money, queryString } from "@/lib/api";
import { useLedger } from "@/lib/state";

type Vendor = {
  vendor: string;
  account: string;
  category: string;
  accounts: string[];
  spend_cents: number;
  count: number;
  average_cents: number | null;
  largest_cents: number | null;
};
type Service = {
  vendor: string;
  category: string;
  cadence: string;
  cost_cents: number;
  confirmed: boolean;
  decision: string;
  spend_cents: number;
  months_charged: number;
  last_charge: string | null;
  annual_cents: number;
  savings_cents: number;
};
type Target = {
  category: string;
  spend_cents: number;
  annual_cents: number;
  percent: number;
  savings_cents: number;
};
type Savings = {
  services: Service[];
  targets: Target[];
  observed_months: number;
  missing_months: string[];
  observed_start: string | null;
  observed_end: string | null;
  total_savings_cents: number;
};

function useReportFilters() {
  const empty = { start: "", end: "", account: "", category: "", search: "" };
  const [filters, setFilters] = useState(empty),
    [draft, setDraft] = useState(empty);
  const controls = (status?: string, extra?: ReactNode) => (
    <FilterPanel label="Filter report" id="report-filter-content">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ ...draft });
        }}
      >
        <FilterFields
          value={draft}
          onChange={(key, value) => setDraft((f) => ({ ...f, [key]: value }))}
          onRangeChange={(start, end) =>
            setDraft((f) => ({ ...f, start, end }))
          }
          prefix="report"
        />
        <FilterFooter
          onReset={() => {
            setDraft({ ...empty });
            setFilters(empty);
          }}
          status={status}
        >
          {extra}
        </FilterFooter>
      </form>
    </FilterPanel>
  );
  return { filters, controls };
}
function csvDownload(
  headers: string[],
  rows: (string | number | null)[][],
  filename: string,
) {
  const cell = (v: string | number | null) => {
    let s = String(v ?? "");
    if (typeof v === "string" && /^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const url = URL.createObjectURL(
    new Blob(
      [
        "\uFEFF" +
          [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
export function VendorAnalysis() {
  const { filters, controls } = useReportFilters(),
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
      {controls(
        query.data
          ? `${rows.length} vendor rows · ${money(rows.reduce((s, r) => s + r.spend_cents, 0))} net spend`
          : "Loading vendors…",
        <Label>
          <Checkbox
            checked={split}
            onCheckedChange={(v) => setSplit(v === true)}
          />
          Break down by account and category
        </Label>,
      )}
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
function ServiceEditor({
  service,
  done,
}: {
  service?: Service;
  done: () => void;
}) {
  const [vendor, setVendor] = useState(service?.vendor || ""),
    [category, setCategory] = useState(service?.category || ""),
    [cadence, setCadence] = useState(service?.cadence || "monthly"),
    [cost, setCost] = useState(String((service?.cost_cents || 0) / 100)),
    [decision, setDecision] = useState(service?.decision || "review"),
    [confirmed, setConfirmed] = useState(service?.confirmed || false);
  const { bootstrap } = useLedger();
  const mutation = useMutation({
    mutationFn: () =>
      api("/api/reports/savings/service", {
        method: "PUT",
        body: {
          vendor: vendor.trim(),
          category,
          cadence,
          cost_cents: Math.round(Number(cost) * 100),
          decision,
          confirmed,
        },
      }),
    onSuccess: done,
  });
  return (
    <form
      className="report-editor"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h2 className="text-lg font-semibold">
        {service ? `Edit ${service.vendor}` : "Add subscription"}
      </h2>
      <p className="text-sm text-muted-foreground">
        Use the exact vendor name from your transactions to match historical
        spending. Decisions apply across accounts and report periods.
      </p>
      <div className="report-filters">
        {service ? (
          <p>{vendor}</p>
        ) : (
          <TextField
            id="service-vendor"
            label="Vendor"
            value={vendor}
            onChange={setVendor}
            required
            maxLength={200}
          />
        )}
        <SelectField
          id="service-category"
          label="Category"
          values={bootstrap.categories}
          empty="Choose category"
          value={category}
          onChange={setCategory}
        />
        <SelectField
          id="service-cadence"
          label="Cadence"
          values={["monthly", "annual"]}
          value={cadence}
          onChange={setCadence}
        />
        <TextField
          id="service-cost"
          label="Cost per charge ($)"
          type="number"
          step="0.01"
          value={cost}
          onChange={setCost}
          required
        />
        <SelectField
          id="service-decision"
          label="Decision"
          values={["keep", "review", "cancel"]}
          value={decision}
          onChange={setDecision}
        />
      </div>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Confirmed recurring service and cost
      </label>
      <div className="flex gap-3">
        <Button
          disabled={
            mutation.isPending ||
            !vendor.trim() ||
            !Number.isFinite(Number(cost)) ||
            Number(cost) < 0
          }
        >
          Save subscription
        </Button>
        <Button type="button" variant="outline" onClick={done}>
          Close
        </Button>
      </div>
      <ErrorMessage error={mutation.error} />
    </form>
  );
}
function TargetEditor({
  target,
  save,
  pending,
}: {
  target: Target;
  save: (category: string, percent: number) => void;
  pending: boolean;
}) {
  const [percent, setPercent] = useState(String(target.percent));
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save(target.category, Number(percent));
      }}
    >
      <input
        className="w-20 rounded border bg-background p-2"
        aria-label={`${target.category} reduction percent`}
        type="number"
        min="0"
        max="100"
        step="0.1"
        value={percent}
        onChange={(e) => setPercent(e.target.value)}
        required
      />
      <span>%</span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || Number(percent) === target.percent}
      >
        Save
      </Button>
    </form>
  );
}
export function SavingsOpportunities() {
  const { filters, controls } = useReportFilters(),
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
      {controls(
        data
          ? `${data.services.length} services · ${data.observed_months} observed months`
          : "Loading savings…",
      )}
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
                Suggestions look for similar billing totals across at least
                three consecutive months, 20–40 days apart. Same-day charges are
                combined; occasional extra charges do not interrupt the pattern.
                Recognized annual memberships also appear for review. Confirm
                the cadence and price before counting savings. Saved services
                remain visible across filters. Other annual services can be
                added manually. No services are canceled by this app.
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
