import { useState } from "react";

const empty = { start: "", end: "", account: "", category: "", search: "" };
export function useReportFilters() {
  const [filters, setFilters] = useState(empty),
    [draft, setDraft] = useState(empty);
  return {
    filters,
    draft,
    changeField: (key: string, value: string) =>
      setDraft((current) => ({ ...current, [key]: value })),
    changeRange: (start: string, end: string) =>
      setDraft((current) => ({ ...current, start, end })),
    apply: () => setFilters({ ...draft }),
    reset: () => {
      setDraft({ ...empty });
      setFilters(empty);
    },
  };
}
