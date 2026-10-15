import { Sparkles, ListChecks, Download } from "lucide-react";
import { FiltersPanel } from "@/components/filters";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api, money, queryString } from "@/lib/api";
import { useLedger } from "@/lib/state";
import type { History, Transaction } from "@/lib/types";
import { ErrorMessage } from "@/components/error-message";
import { Loading } from "@/components/loading";
import { Modal } from "@/components/modal";
import { SelectField } from "@/components/select-field";
import { TextField } from "@/components/text-field";
import { CategoryInput } from "@/components/category-input";
import { SortSelect } from "@/components/sort-select";
import { type SortState } from "@/lib/table-types";
import {
  TransactionTable,
  type TransactionSortKey,
} from "@/components/transaction-table";

export function Transactions() {
  const [sort, setSort] = useState<SortState<TransactionSortKey>>({
    key: "date",
    direction: "desc",
  });
  const { bootstrap, filters, invalidate, setNotice } = useLedger(),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(new Set<number>()),
    [editing, setEditing] = useState<Transaction[]>([]);
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filters, sort]);
  const query = useQuery({
    queryKey: ["transactions", filters, page, sort],
    queryFn: ({ signal }) =>
      api<{ rows: Transaction[]; count: number; pages: number; page: number }>(
        "/api/transactions?" +
          queryString(filters, {
            page: String(page),
            sort: sort.key,
            direction: sort.direction,
          }),
        { signal },
      ),
  });
  const categorize = useMutation({
    mutationFn: () =>
      api<{ job_id: number | null }>("/api/ai/categorize", { method: "POST" }),
    onSuccess: async (r) => {
      setNotice(
        r.job_id
          ? `Categorization job #${r.job_id} queued. Review the suggestions when it finishes.`
          : "No unknown transactions need categorization.",
      );
      await invalidate();
    },
  });
  const applyRules = useMutation({
    mutationFn: () =>
      api<{ updated: number }>("/api/transactions/apply-rules", {
        method: "POST",
      }),
    onSuccess: async (result) => {
      setNotice(
        `${result.updated} unknown transactions categorized using built-in rules.`,
      );
      await invalidate();
    },
  });
  const [category, setCategory] = useState("Other"),
    [subcategory, setSubcategory] = useState(""),
    [kind, setKind] = useState(""),
    [saveRule, setSaveRule] = useState(false);
  const history = useQuery({
    queryKey: ["history", editing[0]?.id],
    queryFn: ({ signal }) =>
      api<History[]>(`/api/transactions/${editing[0].id}/history`, { signal }),
    enabled: editing.length === 1,
  });
  const edit = useMutation({
    mutationFn: () =>
      api("/api/transactions", {
        method: "PATCH",
        body: {
          ids: editing.map((r) => r.id),
          category,
          subcategory,
          kind: kind || null,
          save_rule: saveRule,
        },
      }),
    onSuccess: async () => {
      setEditing([]);
      setSelected(new Set());
      setNotice("Transactions saved and marked reviewed.");
      await invalidate();
    },
  });
  function openEdit(rows: Transaction[]) {
    if (!rows.length) {
      setNotice("Select one or more transactions first.");
      return;
    }
    setEditing(rows);
    setCategory(rows[0].category);
    setSubcategory(rows[0].subcategory);
    setKind(rows.length === 1 ? rows[0].kind : "");
    setSaveRule(false);
    edit.reset();
  }
  return (
    <section id="transactions">
      <header className="transactions-heading">
        <h1>Transactions</h1>
        <p>Find, categorize, and review every transaction.</p>
      </header>
      <FiltersPanel count={query.data?.count} shown={query.data?.rows.length} />
      <article className="transaction-ledger-card">
        <header className="transaction-ledger-heading">
          <div>
            <h2>Transaction ledger</h2>
            <p>
              Expenses are positive and credits negative. Payments and transfers
              do not count toward spending.
            </p>
          </div>
          <div className="ledger-actions">
            <Button
              variant="outline"
              id="bulk-edit"
              onClick={() =>
                openEdit(
                  (query.data?.rows || []).filter((r) => selected.has(r.id)),
                )
              }
            >
              Edit selected{selected.size ? ` (${selected.size})` : ""}
            </Button>
            <Button
              variant="outline"
              disabled={categorize.isPending}
              onClick={() => categorize.mutate()}
            >
              <Sparkles className="size-3.5" /> Categorize unknowns
            </Button>
            <Button
              variant="outline"
              disabled={applyRules.isPending}
              onClick={() => applyRules.mutate()}
            >
              <ListChecks className="size-3.5" />
              {applyRules.isPending ? "Applying…" : "Apply built-in rules"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/api/export?" + queryString(filters);
              }}
            >
              <Download className="size-3.5" /> Export CSV
            </Button>
          </div>
        </header>
        <ErrorMessage error={categorize.error} />
        <ErrorMessage error={applyRules.error} />
        <div id="ledger">
          {query.isPending ? (
            <Loading />
          ) : query.error ? (
            <ErrorMessage error={query.error} />
          ) : query.data.count ? (
            <>
              <div className="p-4 md:hidden">
                <SortSelect
                  id="transaction-sort"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "vendor", label: "Merchant" },
                    { key: "account", label: "Account" },
                    { key: "category", label: "Category" },
                    { key: "amount_cents", label: "Amount" },
                  ]}
                  sort={sort}
                  onChange={setSort}
                />
              </div>
              <div className="flex items-center justify-between gap-2 py-3 text-xs text-muted-foreground md:hidden">
                <span>{selected.size} selected</span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setSelected(
                      new Set(
                        query.data.rows.every((r) => selected.has(r.id))
                          ? []
                          : query.data.rows.map((r) => r.id),
                      ),
                    )
                  }
                >
                  {query.data.rows.every((r) => selected.has(r.id))
                    ? "Clear selection"
                    : "Select all on this page"}
                </Button>
              </div>
              <TransactionTable
                sort={sort}
                onSort={(key) =>
                  setSort((s) => ({
                    key,
                    direction:
                      s.key === key
                        ? s.direction === "asc"
                          ? "desc"
                          : "asc"
                        : key === "amount_cents" || key === "date"
                          ? "desc"
                          : "asc",
                  }))
                }
                rows={query.data.rows}
                selected={selected}
                onSelectAll={(checked) =>
                  setSelected(
                    new Set(checked ? query.data.rows.map((r) => r.id) : []),
                  )
                }
                onSelect={(id, checked) =>
                  setSelected((old) => {
                    const next = new Set(old);
                    if (checked) next.add(id);
                    else next.delete(id);
                    return next;
                  })
                }
                onEdit={(r) => openEdit([r])}
              />
              <div className="transaction-pagination">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => {
                    setPage(page - 1);
                    setSelected(new Set());
                  }}
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {query.data.pages} · {query.data.count} rows
                </span>
                <Button
                  variant="outline"
                  disabled={page >= query.data.pages}
                  onClick={() => {
                    setPage(page + 1);
                    setSelected(new Set());
                  }}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setSelected(new Set(query.data.rows.map((r) => r.id)))
                  }
                >
                  Select this page
                </Button>
              </div>
            </>
          ) : (
            <p className="px-4 py-8 text-sm text-muted-foreground min-[721px]:px-5">
              No transactions match your filters.
            </p>
          )}
        </div>
      </article>
      <Modal
        open={!!editing.length}
        onOpenChange={(v) => {
          if (!v) setEditing([]);
        }}
        id="edit-dialog"
        title="Review transaction"
        description="Corrections take priority over AI suggestions."
      >
        {editing.length === 1 && (
          <div className="space-y-2">
            <p>
              <strong>{editing[0].vendor}</strong>
              <br />
              {editing[0].description}
              <br />
              {editing[0].date} · {money(editing[0].amount_cents)} ·{" "}
              {editing[0].account}
            </p>
            <p className="text-sm text-muted-foreground">
              Category source: {editing[0].category_source} ·{" "}
              {editing[0].explanation}
            </p>
            <a href={`/api/imports/${editing[0].import_id}/file`}>
              Download original statement
            </a>
            {!!history.data?.length && (
              <details>
                <summary>Correction history ({history.data.length})</summary>
                {history.data.map((h, i) => (
                  <p key={i}>
                    {h.at} · {h.before.category} → {h.after.category} ·{" "}
                    {h.before.kind} → {h.after.kind}
                  </p>
                ))}
              </details>
            )}
            <ErrorMessage error={history.error} />
          </div>
        )}
        <form
          id="edit-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            edit.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <CategoryInput
              value={category}
              onChange={setCategory}
              categories={bootstrap.categories}
            />
            <TextField
              id="edit-subcategory"
              label="Subcategory"
              value={subcategory}
              onChange={setSubcategory}
              maxLength={100}
            />
            <SelectField
              id="edit-kind"
              label="Transaction type"
              values={bootstrap.kinds}
              value={kind}
              onChange={setKind}
              empty="Keep existing types"
            />
          </div>
          <Label className="min-h-11 leading-normal">
            <Checkbox
              id="edit-rule"
              checked={saveRule}
              onCheckedChange={(v) => setSaveRule(!!v)}
              disabled={new Set(editing.map((r) => r.vendor)).size !== 1}
            />
            Use this category for future purchases from this merchant
          </Label>
          <ErrorMessage error={edit.error} />
          <Button disabled={edit.isPending}>
            {edit.isPending ? "Working…" : "Save & mark reviewed"}
          </Button>
        </form>
      </Modal>
    </section>
  );
}
