import { useState, type ReactNode } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/shared";
import { useLedger } from "@/lib/state";
import type { Filters } from "@/lib/types";

export function FilterPanel({
  children,
  label = "Filter transactions",
  id = "ledger-filter-content",
}: {
  children: ReactNode;
  label?: string;
  id?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="filter-panel data-filter-panel">
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-between md:hidden"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          {label}
        </span>
        <ChevronDown className={expanded ? "size-4 rotate-180" : "size-4"} />
      </Button>
      <div id={id} className={expanded ? "block" : "hidden md:block"}>
        {children}
      </div>
    </section>
  );
}
export function FilterFields({
  value,
  onChange,
  prefix = "f",
  advanced = false,
}: {
  value: Filters;
  onChange: (key: string, value: string) => void;
  prefix?: string;
  advanced?: boolean;
}) {
  const { bootstrap } = useLedger();
  return (
    <div
      className={`transaction-filter-grid shared-filter-grid ${advanced ? "" : "report-filter-grid"}`}
    >
      <div data-filter-field="search">
        <TextField
          id={`${prefix}-search`}
          label="Merchant or description"
          type="search"
          value={value.search || ""}
          placeholder="Search merchants"
          onChange={(v) => onChange("search", v)}
        />
      </div>
      <div data-filter-field="start">
        <TextField
          id={`${prefix}-start`}
          label="From"
          type="date"
          value={value.start || ""}
          onChange={(v) => onChange("start", v)}
        />
      </div>
      <div data-filter-field="end">
        <TextField
          id={`${prefix}-end`}
          label="Through"
          type="date"
          value={value.end || ""}
          onChange={(v) => onChange("end", v)}
        />
      </div>
      <div data-filter-field="account">
        <SelectField
          id={`${prefix}-account`}
          label="Account"
          values={bootstrap.accounts}
          empty="All accounts"
          value={value.account || ""}
          onChange={(v) => onChange("account", v)}
        />
      </div>
      <div data-filter-field="category">
        <SelectField
          id={`${prefix}-category`}
          label="Category"
          values={bootstrap.categories}
          empty="All categories"
          value={value.category || ""}
          onChange={(v) => onChange("category", v)}
        />
      </div>
      {advanced && (
        <>
          <div data-filter-field="kind">
            <SelectField
              id={`${prefix}-kind`}
              label="Transaction type"
              values={bootstrap.kinds}
              empty="All types"
              value={value.kind || ""}
              onChange={(v) => onChange("kind", v)}
            />
          </div>
          <div data-filter-field="min">
            <TextField
              id={`${prefix}-min`}
              label="Min amount ($)"
              type="number"
              step=".01"
              value={value.min_amount || ""}
              onChange={(v) => onChange("min_amount", v)}
            />
          </div>
          <div data-filter-field="max">
            <TextField
              id={`${prefix}-max`}
              label="Max amount ($)"
              type="number"
              step=".01"
              value={value.max_amount || ""}
              onChange={(v) => onChange("max_amount", v)}
            />
          </div>
        </>
      )}
    </div>
  );
}
export function FilterFooter({
  onReset,
  children,
  status,
}: {
  onReset: () => void;
  children?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="transaction-filter-footer">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="outline" onClick={onReset}>
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
        {children}
      </div>
      <span className="transaction-filter-count" role="status">
        {status}
      </span>
    </div>
  );
}
