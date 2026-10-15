import {
  DATE_PRESETS,
  presetRange,
  rangePreset,
  type DatePreset,
} from "@/lib/date-presets";
import { useState } from "react";
import { SelectField } from "@/components/select-field";
import { TextField } from "@/components/text-field";
import { useLedger } from "@/lib/state";
import type { Filters } from "@/lib/types";

export function FilterFields({
  value,
  onChange,
  prefix = "f",
  advanced = false,
  onRangeChange,
}: {
  value: Filters;
  onChange: (key: string, value: string) => void;
  prefix?: string;
  advanced?: boolean;
  onRangeChange: (start: string, end: string) => void;
}) {
  const { bootstrap } = useLedger();
  const [customSelection, setCustomSelection] = useState<Filters | null>(null);
  const period =
    customSelection === value
      ? "Custom range"
      : rangePreset({ start: value.start || "", end: value.end || "" });
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
      <div data-filter-field="period">
        <SelectField
          id={`${prefix}-period`}
          label="Period"
          values={[...DATE_PRESETS]}
          value={period}
          onChange={(selection) => {
            if (selection === "Custom range") {
              setCustomSelection(value);
              return;
            }
            setCustomSelection(null);
            const range = presetRange(selection as DatePreset);
            if (range) onRangeChange(range.start, range.end);
          }}
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
