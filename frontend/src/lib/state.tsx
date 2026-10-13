import { createContext, useContext, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Bootstrap, Filters, ReportView } from "./types";
interface ReportSelection {
  view: ReportView;
  period: string;
  account: string;
}
interface AppState {
  reportSelection: ReportSelection;
  setReportSelection: (selection: ReportSelection) => void;
  bootstrap: Bootstrap;
  filters: Filters;
  draft: Filters;
  setDraft: (f: Filters) => void;
  apply: (f: Filters) => void;
  notice: string;
  setNotice: (s: string) => void;
  invalidate: () => Promise<void>;
}
const Context = createContext<AppState | null>(null);
export function LedgerProvider({
  bootstrap,
  children,
}: {
  bootstrap: Bootstrap;
  children: ReactNode;
}) {
  const [filters, setFilters] = useState<Filters>({}),
    [draft, setDraft] = useState<Filters>({}),
    [notice, setNotice] = useState("");
  const [reportSelection, setReportSelection] = useState<ReportSelection>({
    view: "monthly",
    period: "",
    account: "",
  });
  const client = useQueryClient();
  function apply(f: Filters) {
    const next = Object.fromEntries(
      Object.entries(f).filter(([, v]) => v !== ""),
    );
    setDraft(next);
    setFilters(next);
  }
  async function invalidate() {
    await Promise.all(
      ["bootstrap", "transactions", "reports", "imports", "rules", "jobs"].map(
        (key) => client.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }
  return (
    <Context.Provider
      value={{
        bootstrap,
        reportSelection,
        setReportSelection,
        filters,
        draft,
        setDraft,
        apply,
        notice,
        setNotice,
        invalidate,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useLedger() {
  const state = useContext(Context);
  if (!state) throw new Error("Ledger provider missing");
  return state;
}
