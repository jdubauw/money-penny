import { Sparkles } from "lucide-react";
import { FilterPanel, FilterFields, FilterFooter } from "./filter-panel";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useLedger } from "@/lib/state";
import type { FilterPlan } from "@/lib/types";
import { ErrorMessage, Modal, TextField } from "./shared";
export function FiltersPanel({
  count,
  shown,
}: {
  count?: number;
  shown?: number;
}) {
  const { draft, setDraft, apply } = useLedger(),
    navigate = useNavigate();
  const [question, setQuestion] = useState(""),
    [plan, setPlan] = useState<FilterPlan | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      api<FilterPlan>("/api/ai/filter", { method: "POST", body: { question } }),
    onSuccess: setPlan,
  });
  const change = (key: string, value: string) =>
    setDraft({ ...draft, [key]: value });
  return (
    <FilterPanel>
      <form
        className="transaction-ai-filter"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="transaction-ai-title">
          <Sparkles className="size-4" />
          Ask AI to filter
        </div>
        <div className="transaction-ai-input">
          <TextField
            id="question"
            label="Describe the transactions you want to see"
            value={question}
            onChange={setQuestion}
            required
            placeholder="Dining purchases over $50 this year"
          />
          <Button disabled={mutation.isPending || !question.trim()}>
            {mutation.isPending ? "Working…" : "Preview filters"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sends your question plus category and account labels — never
          transaction data.
        </p>
        <ErrorMessage error={mutation.error} />
      </form>

      <form
        id="filter-form"
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        {(draft.spending === "true" || draft.vendor) && (
          <div
            className="transaction-active-filters"
            role="group"
            aria-label="Active transaction filters"
          >
            {draft.spending === "true" && (
              <div className="transaction-filter-chip">
                <span>Spending transactions only</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
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
              <div className="transaction-filter-chip">
                <span>
                  Merchant: <strong>{draft.vendor}</strong>
                </span>
                <Button
                  id="clear-merchant"
                  type="button"
                  variant="ghost"
                  size="sm"
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
          </div>
        )}
        <input id="f-vendor" type="hidden" value={draft.vendor || ""} />
        <FilterFields
          value={draft}
          onChange={change}
          onRangeChange={(start, end) => setDraft({ ...draft, start, end })}
          advanced
        />
        <FilterFooter
          onReset={() => apply({})}
          status={
            count === undefined
              ? "Loading transactions…"
              : `${shown || 0} of ${count} shown`
          }
        >
          <Label className="min-h-11">
            <Checkbox
              id="f-review"
              checked={draft.review === "true"}
              onCheckedChange={(v) => change("review", v ? "true" : "")}
            />
            Needs review
          </Label>
        </FilterFooter>
      </form>
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
    </FilterPanel>
  );
}
