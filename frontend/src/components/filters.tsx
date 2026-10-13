import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useLedger } from "@/lib/state";
import type { FilterPlan } from "@/lib/types";
import { ErrorMessage, Modal, SelectField, TextField } from "./shared";
export function FiltersPanel() {
  const { bootstrap, draft, setDraft, apply } = useLedger(),
    navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [ask, setAsk] = useState(false),
    [question, setQuestion] = useState(""),
    [plan, setPlan] = useState<FilterPlan | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      api<FilterPlan>("/api/ai/filter", { method: "POST", body: { question } }),
    onSuccess: setPlan,
  });
  const change = (key: string, value: string) =>
    setDraft({ ...draft, [key]: value });
  return (
    <section className="filter-panel">
      <Button
        variant="ghost"
        className="mb-2 w-full justify-between md:hidden"
        aria-expanded={expanded}
        aria-controls="ledger-filter-content"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" /> Filter transactions
        </span>
        <ChevronDown className={expanded ? "size-4 rotate-180" : "size-4"} />
      </Button>
      <div
        id="ledger-filter-content"
        className={expanded ? "block" : "hidden md:block"}
      >
        <form
          id="filter-form"
          onSubmit={(e) => {
            e.preventDefault();
            apply(draft);
          }}
        >
          {draft.spending === "true" && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span>Spending transactions only</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const next = { ...draft };
                  delete next.spending;
                  apply(next);
                }}
              >
                Show all types
              </Button>
            </div>
          )}
          {draft.vendor && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span>Merchant: {draft.vendor}</span>
              <Button
                id="clear-merchant"
                type="button"
                variant="outline"
                onClick={() => {
                  const next = { ...draft };
                  delete next.vendor;
                  apply(next);
                }}
              >
                Clear merchant
              </Button>
            </div>
          )}
          <input id="f-vendor" type="hidden" value={draft.vendor || ""} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <TextField
              id="f-start"
              label="From"
              type="date"
              value={draft.start || ""}
              onChange={(v) => change("start", v)}
            />
            <TextField
              id="f-end"
              label="Through"
              type="date"
              value={draft.end || ""}
              onChange={(v) => change("end", v)}
            />
            <SelectField
              id="f-account"
              label="Account"
              values={bootstrap.accounts}
              value={draft.account || ""}
              empty="All accounts"
              onChange={(v) => change("account", v)}
            />
            <SelectField
              id="f-category"
              label="Category"
              values={bootstrap.categories}
              value={draft.category || ""}
              empty="All categories"
              onChange={(v) => change("category", v)}
            />
            <TextField
              id="f-search"
              label="Merchant or description"
              type="search"
              value={draft.search || ""}
              placeholder="Coffee"
              onChange={(v) => change("search", v)}
            />
            <SelectField
              id="f-kind"
              label="Transaction type"
              values={bootstrap.kinds}
              value={draft.kind || ""}
              empty="All types"
              onChange={(v) => change("kind", v)}
            />
            <TextField
              id="f-min"
              label="Minimum amount ($)"
              type="number"
              step=".01"
              value={draft.min_amount || ""}
              onChange={(v) => change("min_amount", v)}
            />
            <TextField
              id="f-max"
              label="Maximum amount ($)"
              type="number"
              step=".01"
              value={draft.max_amount || ""}
              onChange={(v) => change("max_amount", v)}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Apply filters</Button>
              <Button type="button" variant="outline" onClick={() => apply({})}>
                Reset
              </Button>
              <Label className="min-h-11">
                <Checkbox
                  id="f-review"
                  checked={draft.review === "true"}
                  onCheckedChange={(v) => change("review", v ? "true" : "")}
                />
                Needs review
              </Label>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAsk(!ask)}
            >
              Ask AI to filter
            </Button>
          </div>
        </form>
        {ask && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <TextField
              id="question"
              label="Describe the transactions you want to see"
              value={question}
              onChange={setQuestion}
              required
              placeholder="Dining purchases over $50 this year"
            />
            <Button disabled={mutation.isPending}>
              {mutation.isPending ? "Working…" : "Preview filters"}
            </Button>
            <ErrorMessage error={mutation.error} />
          </form>
        )}
        <Modal
          open={!!plan}
          onOpenChange={(v) => {
            if (!v) setPlan(null);
          }}
          id="plan-dialog"
          title="Suggested filters"
          description="Review AI's interpretation before applying it."
        >
          {plan && (
            <>
              <p>{plan.explanation}</p>
              <dl>
                {Object.entries(plan)
                  .filter(([k, v]) => k !== "explanation" && v !== null)
                  .map(([k, v]) => (
                    <div
                      key={k}
                      className="flex flex-wrap justify-between gap-3 border-b py-2"
                    >
                      <dt>{k.replaceAll("_", " ")}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
              </dl>
              <Button
                onClick={() => {
                  apply(
                    Object.fromEntries(
                      Object.entries(plan)
                        .filter(([k, v]) => k !== "explanation" && v !== null)
                        .map(([k, v]) => [k, String(v)]),
                    ),
                  );
                  setPlan(null);
                  void navigate({ to: "/transactions" });
                }}
              >
                Apply these filters
              </Button>
            </>
          )}
        </Modal>
      </div>
    </section>
  );
}
