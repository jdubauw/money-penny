import {
  ShieldCheck,
  Server,
  KeyRound,
  Trash2,
  FileClock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
  const [allJobs, setAllJobs] = useState(false);
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
    <section id="settings" className="ai-settings-page">
      <header className="ai-page-heading">
        <h1>AI &amp; rules</h1>
        <p>Choose a provider and teach the app your merchant preferences.</p>
      </header>
      <form
        id="settings-form"
        className="ai-card"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <header className="ai-card-heading">
          <h2>Categorization provider</h2>
          <p>
            Pick the model that labels transactions. There is no automatic
            fallback between providers.
          </p>
        </header>
        <div className="ai-provider-body">
          <Field id="ai-provider" label="Provider">
            <select
              id="ai-provider"
              className="hidden"
              value={values.provider}
              onChange={(e) =>
                setValues({
                  ...values,
                  provider: e.target.value as AIConfig["provider"],
                })
              }
            >
              <option value="none">Rules only</option>
              <option value="ollama">Ollama · local server</option>
              <option value="openai">OpenAI · API key</option>
            </select>
            <div className="ai-provider-options">
              {(
                [
                  ["openai", "OpenAI", "API key"],
                  ["ollama", "Ollama", "Self-hosted"],
                  ["none", "Rules only", "No AI requests"],
                ] as const
              ).map(([value, title, description]) => (
                <label
                  key={value}
                  className={values.provider === value ? "is-selected" : ""}
                >
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <input
                    type="radio"
                    name="provider-choice"
                    value={value}
                    checked={values.provider === value}
                    onChange={() => setValues({ ...values, provider: value })}
                  />
                </label>
              ))}
            </div>
          </Field>
          {values.provider !== "none" && (
            <div className="ai-provider-configuration">
              {values.provider === "ollama" ? (
                <TextField
                  id="ollama-model"
                  label="Ollama model"
                  value={values.ollama_model}
                  onChange={(v) => setValues({ ...values, ollama_model: v })}
                  placeholder="Installed model name"
                  maxLength={150}
                />
              ) : (
                <TextField
                  id="openai-model"
                  label="OpenAI model"
                  value={values.openai_model}
                  onChange={(v) => setValues({ ...values, openai_model: v })}
                  placeholder="Model supporting structured outputs"
                  maxLength={150}
                />
              )}
              <dl className="ai-server-status">
                <div>
                  <dt>
                    <Server className="size-3.5" />
                    Endpoint
                  </dt>
                  <dd>
                    {values.provider === "ollama"
                      ? bootstrap.ai.ollama_url
                      : bootstrap.ai.openai_url}
                  </dd>
                </div>
                {values.provider === "openai" && (
                  <div>
                    <dt>
                      <KeyRound className="size-3.5" />
                      API key
                    </dt>
                    <dd>
                      <span
                        className={
                          "ai-status " +
                          (bootstrap.ai.openai_key_configured
                            ? "is-completed"
                            : "is-queued")
                        }
                      >
                        {bootstrap.ai.openai_key_configured
                          ? "Configured on server"
                          : "Not configured"}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
          <div className="ai-privacy-note">
            <ShieldCheck className="size-4 shrink-0" />
            <p>
              <strong>What gets sent:</strong> categorization sends merchant
              descriptions only. AI filtering sends your question and available
              category and account labels.
            </p>
          </div>
          <div className="ai-provider-actions">
            <Button
              type="button"
              variant="outline"
              disabled={
                test.isPending || save.isPending || values.provider === "none"
              }
              onClick={() => test.mutate()}
            >
              {test.isPending ? "Working…" : "Test saved provider"}
            </Button>
            <Button disabled={save.isPending}>
              {save.isPending ? "Working…" : "Save settings"}
            </Button>
          </div>
          <ErrorMessage error={save.error || test.error} />
        </div>
        <footer className="ai-card-footer">
          Set server URLs and <code>OPENAI_API_KEY</code> in your Coolify
          environment variables. The key is never sent to your browser.
        </footer>
      </form>
      <div className="ai-settings-grid">
        <article className="ai-card">
          <header className="ai-card-heading">
            <h2>Merchant rules</h2>
            <p className="text-muted-foreground">
              Save rules when reviewing transactions. Rules apply to future
              imports before AI.
            </p>
          </header>
          <ErrorMessage error={remove.error} />
          <div className="ai-rule-labels">
            <span>Merchant</span>
            <span>Category</span>
            <span />
          </div>
          <div id="rules-list">
            {rules.isPending ? (
              <Loading />
            ) : rules.error ? (
              <ErrorMessage error={rules.error} />
            ) : rules.data.length ? (
              rules.data.map((r) => (
                <div key={r.id} className="ai-rule-row">
                  <span>
                    {r.vendor}{" "}
                    <ArrowRight className="inline size-3 text-muted-foreground" />
                  </span>
                  <span className="ai-rule-category">
                    {r.category}
                    {r.subcategory ? " / " + r.subcategory : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={"Remove rule for " + r.vendor}
                    aria-label={"Remove rule for " + r.vendor}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(r.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">
                No saved merchant rules yet.
              </p>
            )}
          </div>
          <footer className="ai-card-footer">
            {rules.data?.length || 0} rules · Applied to future imports before
            AI suggestions
          </footer>
        </article>
        <article className="ai-card">
          <header className="ai-card-heading ai-jobs-heading">
            <div>
              <h2>Processing jobs</h2>
              <p>Imports and AI categorization batches, newest first.</p>
            </div>
            <span className="ai-status is-running">
              {jobs.data?.filter((j) =>
                ["queued", "running"].includes(j.status),
              ).length || 0}{" "}
              active
            </span>
          </header>
          <div id="jobs-list">
            {jobs.isPending ? (
              <Loading />
            ) : jobs.error ? (
              <ErrorMessage error={jobs.error} />
            ) : (
              jobs.data
                .filter(
                  (j, index) =>
                    allJobs ||
                    index < 4 ||
                    ["queued", "running"].includes(j.status),
                )
                .map((j) => (
                  <div key={j.id} className="ai-job-row">
                    <div className="ai-job-icon">
                      {j.kind === "import" ? (
                        <FileClock className="size-4" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                    </div>
                    <div className="ai-job-body">
                      <div className="ai-job-title">
                        <strong>
                          {j.kind === "import" ? "Import" : "Categorize"} #
                          {j.id}
                        </strong>
                        <span className={"ai-status is-" + j.status}>
                          {j.status}
                        </span>
                      </div>
                      <ErrorMessage error={j.error} />
                      {j.result.total !== undefined && (
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p>
                            {j.result.processed || 0} of {j.result.total}{" "}
                            transactions checked
                            {j.result.updated_at
                              ? " · Last progress " +
                                new Date(
                                  j.result.updated_at,
                                ).toLocaleTimeString()
                              : ""}
                          </p>
                          <progress
                            className="h-2 w-full accent-primary"
                            value={j.result.processed || 0}
                            max={Math.max(1, j.result.total)}
                            aria-label={
                              "Categorization progress for job " + j.id
                            }
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
                          {j.result.categorized} transactions categorized;
                          review the suggestions in the ledger.
                        </p>
                      )}
                    </div>
                  </div>
                ))
            )}
            {(jobs.data?.length || 0) > 4 && (
              <div className="ai-card-footer">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={allJobs}
                  onClick={() => setAllJobs(!allJobs)}
                >
                  {allJobs
                    ? "Show recent jobs"
                    : "Show all " + jobs.data?.length + " jobs"}
                </Button>
              </div>
            )}
            {jobs.data?.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                No processing jobs yet.
              </p>
            )}
          </div>
        </article>
      </div>
      <div className="ai-reset-section">
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
