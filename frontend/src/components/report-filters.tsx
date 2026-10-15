import type { ReactNode } from "react";
import type { useReportFilters } from "@/hooks/use-report-filters";
import { FilterPanel } from "@/components/filter-panel";
import { FilterFields } from "@/components/filter-fields";
import { FilterFooter } from "@/components/filter-footer";

export function ReportFilters({
  state,
  status,
  children,
}: {
  state: ReturnType<typeof useReportFilters>;
  status?: string;
  children?: ReactNode;
}) {
  return (
    <FilterPanel label="Filter report" id="report-filter-content">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          state.apply();
        }}
      >
        <FilterFields
          value={state.draft}
          onChange={state.changeField}
          onRangeChange={state.changeRange}
          prefix="report"
        />
        <FilterFooter onReset={state.reset} status={status}>
          {children}
        </FilterFooter>
      </form>
    </FilterPanel>
  );
}
