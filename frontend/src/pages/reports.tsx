import { useState } from "react";
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
  const [filters, setFilters] = useState({
    start: "",
    end: "",
    account: "",
    category: "",
    search: "",
  });
  const { bootstrap } = useLedger();
  const field = (key: keyof typeof filters) => (v: string) =>
    setFilters((f) => ({ ...f, [key]: v }));
  const controls = (
    <div className="report-filters">
      <TextField
        id="report-start"
        label="From"
        type="date"
        value={filters.start}
        onChange={field("start")}
      />
      <TextField
        id="report-end"
        label="Through"
        type="date"
        value={filters.end}
        onChange={field("end")}
      />
      <SelectField
        id="report-account"
        label="Account"
        values={bootstrap.accounts}
        empty="All accounts"
        value={filters.account}
        onChange={field("account")}
      />
      <SelectField
        id="report-category"
        label="Category"
        values={bootstrap.categories}
        empty="All categories"
        value={filters.category}
        onChange={field("category")}
      />
      <TextField
        id="report-search"
        label="Vendor or description"
        type="search"
        value={filters.search}
        onChange={field("search")}
      />
      <Button
        variant="outline"
        onClick={() =>
          setFilters({
            start: "",
            end: "",
            account: "",
            category: "",
            search: "",
          })
        }
      >
        Reset filters
      </Button>
    </div>
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
  const [split, setSplit] = useState(false),
    [sort, setSort] = useState<keyof Vendor>("spend_cents"),
    [ascending, setAscending] = useState(false);
  const query = useQuery({
    queryKey: ["reports", "vendors", filters, split],
    queryFn: ({ signal }) =>
      api<Vendor[]>(
        "/api/reports/vendors?" +
          queryString(filters, { split: String(split) }),
        { signal },
      ),
  });
  const maximum = Math.max(1, ...(query.data || []).map((v) => v.spend_cents));
  const rows = [...(query.data || [])].sort((a, b) => {
    const x = a[sort],
      y = b[sort];
    return (
      (typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x ?? "").localeCompare(String(y ?? ""))) * (ascending ? 1 : -1)
    );
  });
  function order(key: keyof Vendor) {
    setSort(key);
    setAscending(sort === key ? !ascending : key === "vendor");
  }
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
      {controls}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={split}
          onChange={(e) => setSplit(e.target.checked)}
        />
        Break down by account and category
      </label>
      <ErrorMessage error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        query.data && (
          <>
            <p className="text-sm text-muted-foreground">
              {rows.length} vendor rows ·{" "}
              {money(rows.reduce((s, r) => s + r.spend_cents, 0))} net spend
            </p>
            <div className="report-table">
              <table>
                <thead>
                  <tr>
                    {headings.map(([key, title]) => (
                      <th
                        key={key}
                        aria-sort={
                          sort === key
                            ? ascending
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <button onClick={() => order(key)}>
                          {title} {sort === key ? (ascending ? "↑" : "↓") : "↕"}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <button
                          className="text-primary underline-offset-4 hover:underline"
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
                      </td>
                      <td>{r.category}</td>
                      <td>{r.account || r.accounts.join(", ")}</td>
                      <td>
                        <div className="relative">
                          <span
                            className="absolute inset-y-0 left-0 bg-primary/10"
                            style={{
                              width: `${(Math.max(0, r.spend_cents) / maximum) * 100}%`,
                            }}
                          />
                          <span className="relative">
                            {money(r.spend_cents)}
                          </span>
                        </div>
                      </td>
                      <td>{r.count}</td>
                      <td>
                        {r.average_cents === null
                          ? "—"
                          : money(r.average_cents)}
                      </td>
                      <td>
                        {r.largest_cents === null
                          ? "—"
                          : money(r.largest_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <p className="p-6 text-muted-foreground">
                  No spending transactions match these filters.
                </p>
              )}
            </div>
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
  const data = query.data;
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
        ...data.services.map((s) => [
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
        ...data.targets.map((t) => [
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
      {controls}
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
                Suggestions require at least three similar charges, 20–40 days
                apart. Confirm the cadence and price before counting savings.
                Saved services remain visible across filters. Annual services
                can be added manually. No services are canceled by this app.
              </p>
            </div>
            <div className="report-table">
              <table>
                <thead>
                  <tr>
                    {[
                      "Service",
                      "Category",
                      "Cadence",
                      "Decision",
                      "Period spend",
                      "Months charged",
                      "Last charge",
                      "Annual cost",
                      "Potential savings",
                      "",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((s) => (
                    <tr key={s.vendor}>
                      <td>
                        <button
                          type="button"
                          className="text-primary underline-offset-4 hover:underline focus-visible:underline"
                          aria-label={`View transactions for ${s.vendor}`}
                          onClick={() => {
                            apply({
                              ...filters,
                              vendor: s.vendor,
                              spending: "true",
                            });
                            void navigate({ to: "/transactions" });
                          }}
                        >
                          {s.vendor}
                        </button>
                        <small className="block text-muted-foreground">
                          {s.confirmed ? "Confirmed" : "Needs confirmation"}
                        </small>
                      </td>
                      <td>{s.category || "—"}</td>
                      <td>{s.cadence}</td>
                      <td>{s.decision}</td>
                      <td>{money(s.spend_cents)}</td>
                      <td>{s.months_charged}</td>
                      <td>{s.last_charge || "—"}</td>
                      <td>{money(s.annual_cents)}</td>
                      <td>{money(s.savings_cents)}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(s)}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.services.length && (
                <p className="p-6 text-muted-foreground">
                  No recurring-charge suggestions yet. Add a service manually or
                  import more statements.
                </p>
              )}
            </div>
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
            <div className="report-table">
              <table>
                <thead>
                  <tr>
                    {[
                      "Category",
                      "Period spend",
                      "Annual baseline",
                      "Suggested reduction",
                      "Annual savings",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.targets.map((t) => (
                    <tr key={t.category}>
                      <td>{t.category}</td>
                      <td>{money(t.spend_cents)}</td>
                      <td>{money(t.annual_cents)}</td>
                      <td>
                        <TargetEditor
                          key={`${t.category}:${t.percent}`}
                          target={t}
                          pending={target.isPending}
                          save={(category, percent) =>
                            target.mutate({ category, percent })
                          }
                        />
                      </td>
                      <td>{money(t.savings_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.targets.length && (
                <p className="p-6 text-muted-foreground">
                  No category spending in this period.
                </p>
              )}
            </div>
          </>
        )
      )}
    </section>
  );
}
