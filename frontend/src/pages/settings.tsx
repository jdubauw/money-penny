import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { api } from "@/lib/api";
import { useLedger } from "@/lib/state";
import type { AIConfig, Job, Rule } from "@/lib/types";
import {
  ErrorMessage,
  Field,
  Loading,
  Modal,
  TextField,
} from "@/components/shared";
export function Settings() {
  const { bootstrap, invalidate, setNotice } = useLedger(),
    [values, setValues] = useState(bootstrap.ai);
  const rules = useQuery({
    queryKey: ["rules"],
    queryFn: ({ signal }) => api<Rule[]>("/api/rules", { signal }),
  });
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: ({ signal }) => api<Job[]>("/api/jobs", { signal }),
    refetchInterval: 4000,
  });
  const save = useMutation({
    mutationFn: () =>
      api<AIConfig>("/api/settings/ai", {
        method: "PUT",
        body: {
          provider: values.provider,
          ollama_model: values.ollama_model,
          openai_model: values.openai_model,
        },
      }),
    onSuccess: async (data) => {
      setValues(data);
      setNotice("AI settings saved.");
      await invalidate();
    },
  });
  const test = useMutation({
    mutationFn: () => api("/api/ai/test", { method: "POST" }),
    onSuccess: () => setNotice("Saved AI provider responded successfully."),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/rules/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setNotice("Merchant rule removed.");
      await invalidate();
    },
  });
  const [resetOpen, setResetOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [resetPassword, setResetPassword] = useState("");
  const reset = useMutation({
    mutationFn: () =>
      api("/api/settings/reset", {
        method: "POST",
        body: { confirmation, password: resetPassword },
      }),
    onSuccess: () => {
      try {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith("csv:")) localStorage.removeItem(key);
        }
      } catch {
        // Storage may be disabled; still refresh the cleared ledger.
      }
      window.location.assign("/");
    },
  });
  return (
    <section id="settings">
      <form
        id="settings-form"
        className="max-w-4xl space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ai-provider" label="Categorization provider">
            <NativeSelect
              id="ai-provider"
              value={values.provider}
              onChange={(e) =>
                setValues({
                  ...values,
                  provider: e.target.value as AIConfig["provider"],
                })
              }
            >
              <NativeSelectOption value="none">Rules only</NativeSelectOption>
              <NativeSelectOption value="ollama">
                Ollama · local server
              </NativeSelectOption>
              <NativeSelectOption value="openai">
                OpenAI · API key
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <TextField
            id="ollama-model"
            label="Ollama model"
            value={values.ollama_model}
            onChange={(v) => setValues({ ...values, ollama_model: v })}
            placeholder="Installed model name"
            maxLength={150}
          />
          <TextField
            id="openai-model"
            label="OpenAI model"
            value={values.openai_model}
            onChange={(v) => setValues({ ...values, openai_model: v })}
            placeholder="Model supporting structured outputs"
            maxLength={150}
          />
        </div>
        <p className="break-all text-sm text-muted-foreground">
          Ollama server: {bootstrap.ai.ollama_url}
          <br />
          OpenAI endpoint: {bootstrap.ai.openai_url}
          <br />
          OpenAI key:{" "}
          {bootstrap.ai.openai_key_configured
            ? "configured on server"
            : "not configured"}
        </p>
        <p className="text-muted-foreground">
          Categorization sends merchant descriptions only. AI filtering sends
          your question and available category/account labels. There is no
          automatic provider fallback.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={save.isPending}>
            {save.isPending ? "Working…" : "Save settings"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={test.isPending || save.isPending}
            onClick={() => test.mutate()}
          >
            {test.isPending ? "Working…" : "Test saved provider"}
          </Button>
        </div>
        <ErrorMessage error={save.error || test.error} />
        <p className="text-sm text-muted-foreground">
          Set server URLs and OPENAI_API_KEY in Coolify environment variables.
          The key is never sent to your browser.
        </p>
      </form>
      <div className="mt-8 border-t pt-6">
        <h2>Merchant rules</h2>
        <p className="mb-4 text-muted-foreground">
          Save rules when reviewing transactions. Rules apply to future imports
          before AI.
        </p>
        <ErrorMessage error={remove.error} />
        <div id="rules-list">
          {rules.isPending ? (
            <Loading />
          ) : rules.error ? (
            <ErrorMessage error={rules.error} />
          ) : rules.data.length ? (
            rules.data.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
              >
                <span>
                  {r.vendor} → {r.category}
                  {r.subcategory ? " / " + r.subcategory : ""}
                </span>
                <Button
                  variant="outline"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(r.id)}
                >
                  Remove rule
                </Button>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">
              No saved merchant rules yet.
            </p>
          )}
        </div>
      </div>
      <div className="mt-8 border-t pt-6">
        <h2>Processing jobs</h2>
        <div id="jobs-list">
          {jobs.isPending ? (
            <Loading />
          ) : jobs.error ? (
            <ErrorMessage error={jobs.error} />
          ) : (
            jobs.data.map((j) => (
              <div key={j.id} className="border-b py-3">
                {j.kind} #{j.id} · {j.status}
                <ErrorMessage error={j.error} />
                {j.result.total !== undefined && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>
                      {j.result.processed || 0} of {j.result.total} transactions
                      checked
                      {j.result.updated_at
                        ? " · Last progress " +
                          new Date(j.result.updated_at).toLocaleTimeString()
                        : ""}
                    </p>
                    <progress
                      className="h-2 w-full accent-primary"
                      value={j.result.processed || 0}
                      max={Math.max(1, j.result.total)}
                      aria-label={"Categorization progress for job " + j.id}
                    />
                  </div>
                )}
                {j.status === "queued" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Waiting for the worker. Imports run before the next AI
                    batch.
                  </p>
                )}
                {j.result.categorized !== undefined && (
                  <p>
                    {j.result.categorized} transactions categorized; review the
                    suggestions in the ledger.
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="mt-8 space-y-4 border-destructive/30">
        <h2 className="text-destructive">Reset all data</h2>
        <p className="text-sm text-muted-foreground">
          Delete all transactions, uploaded statements, accounts, merchant
          rules, edit history, and processing history. Your login and AI
          settings stay saved. This cannot be undone.
        </p>
        <Button
          variant="destructive"
          onClick={() => {
            setConfirmation("");
            setResetPassword("");
            reset.reset();
            setResetOpen(true);
          }}
        >
          Reset all data
        </Button>
      </div>
      <Modal
        open={resetOpen}
        onOpenChange={(open) => {
          if (!reset.isPending) {
            setResetOpen(open);
            setResetPassword("");
          }
        }}
        id="reset-dialog"
        title="Delete all spending data?"
        description="This permanently deletes your ledger and original statement files. There is no undo."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Wait for all import and AI jobs to finish before resetting. Your
            login and AI connection settings will be kept.
          </p>
          <TextField
            id="reset-confirmation"
            label="Type DELETE ALL DATA to confirm"
            value={confirmation}
            onChange={setConfirmation}
            required
          />
          <TextField
            id="reset-password"
            label="Your sign-in password"
            type="password"
            value={resetPassword}
            onChange={setResetPassword}
            required
          />
          <ErrorMessage error={reset.error} />
          <Button
            variant="destructive"
            disabled={
              reset.isPending ||
              confirmation !== "DELETE ALL DATA" ||
              !resetPassword
            }
          >
            {reset.isPending ? "Deleting…" : "Delete all data permanently"}
          </Button>
        </form>
      </Modal>
    </section>
  );
}
