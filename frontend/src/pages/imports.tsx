import { useRef, useState } from "react";
import {
  UploadCloud,
  CreditCard,
  Landmark,
  Info,
  ArrowRight,
  Download,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select/native-select";
import { NativeSelectOption } from "@/components/ui/native-select/native-select-option";
import { api, money } from "@/lib/api";
import {
  uploadStatements,
  type UploadBatch,
  type UploadResult,
} from "@/lib/upload-statements";
import { useLedger } from "@/lib/state";
import type { ImportRecord } from "@/lib/types";
import { ErrorMessage } from "@/components/error-message";
import { Field } from "@/components/field";
import { Loading } from "@/components/loading";
import { Modal } from "@/components/modal";
import { TextField } from "@/components/text-field";
import { TransactionTable } from "@/components/transaction-table";

interface Preferences {
  date_format: string;
  negative_expenses: boolean;
  mapping: Record<string, string>;
}
const defaults: Preferences = {
  date_format: "%m/%d/%Y",
  negative_expenses: false,
  mapping: {},
};
export function Imports() {
  const { bootstrap, invalidate, setNotice } = useLedger(),
    client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState(""),
    [accountKind, setAccountKind] = useState("credit"),
    [files, setFiles] = useState<File[]>([]),
    [prefs, setPrefs] = useState<Preferences>(defaults);
  const [dragging, setDragging] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [preview, setPreview] = useState<ImportRecord | null>(null),
    [selected, setSelected] = useState(new Set<number>()),
    [page, setPage] = useState(1),
    [ack, setAck] = useState(false);
  const imports = useQuery({
    queryKey: ["imports"],
    queryFn: ({ signal }) => api<ImportRecord[]>("/api/imports", { signal }),
    refetchInterval: (query) =>
      query.state.data?.some((i) => ["queued", "processing"].includes(i.status))
        ? 2500
        : false,
  });
  const open = useMutation({
    mutationFn: (id: number) => api<ImportRecord>(`/api/imports/${id}`),
    onSuccess: (item) => {
      if (item.status !== "preview") {
        setNotice("This import is not ready for review.");
        return;
      }
      setPreview(item);
      setPage(1);
      setAck(false);
      setSelected(
        new Set(
          item
            .preview!.rows.map((r, i) => (r.duplicate_candidate ? -1 : i))
            .filter((i) => i >= 0),
        ),
      );
      commit.reset();
    },
  });
  const upload = useMutation({
    mutationFn: async (batch: UploadBatch) => {
      if (!batch.files.length)
        throw new Error("Choose one or more CSV or PDF files.");
      return uploadStatements(batch, setUploadResults);
    },
    onSuccess: async (results, batch) => {
      try {
        localStorage.setItem(
          "csv:" + batch.account.trim(),
          JSON.stringify(batch.options),
        );
      } catch {
        /* Browser storage may be unavailable. */
      }
      const failed = results.filter((result) => result.status === "failed");
      setFiles(failed.map((result) => result.file));
      if (fileInput.current) fileInput.current.value = "";
      const uploaded = results.filter(
        (result) => result.status === "uploaded",
      ).length;
      const duplicates = results.filter(
        (result) => result.status === "duplicate",
      ).length;
      setNotice(
        uploaded +
          " uploaded · " +
          duplicates +
          " already uploaded · " +
          failed.length +
          " failed. Review each statement in the archive when extraction finishes.",
      );
      await invalidate();
      if (results.length === 1 && results[0].item?.status === "preview")
        open.mutate(results[0].item.id);
    },
  });
  const commit = useMutation({
    mutationFn: () =>
      api<{ imported: number }>(`/api/imports/${preview!.id}/commit`, {
        method: "POST",
        body: { selected_indices: [...selected], acknowledge_warnings: ack },
      }),
    onSuccess: async (result) => {
      setPreview(null);
      setNotice(`${result.imported} transactions imported.`);
      await invalidate();
      client.removeQueries({ queryKey: ["history"] });
    },
  });
  const [duplicateReview, setDuplicateReview] = useState<{
    id: number;
    account: string;
    rows: number;
    matched_rows: number;
    can_remove: boolean;
    spending_cents: number;
  } | null>(null);
  const checkDuplicates = useMutation({
    mutationFn: (id: number) =>
      api<NonNullable<typeof duplicateReview>>(`/api/imports/${id}/duplicates`),
    onSuccess: (result) => {
      removeDuplicates.reset();
      setDuplicateReview(result);
    },
  });
  const removeDuplicates = useMutation({
    mutationFn: () =>
      api(`/api/imports/${duplicateReview!.id}/duplicates`, {
        method: "DELETE",
        body: { confirm_import_id: duplicateReview!.id },
      }),
    onSuccess: async () => {
      setDuplicateReview(null);
      setNotice(
        "Duplicate import transactions removed. Original statement retained.",
      );
      await invalidate();
      client.removeQueries({ queryKey: ["history"] });
    },
  });
  function accountChanged(value: string) {
    setAccount(value);
    try {
      const saved = localStorage.getItem("csv:" + value.trim());
      setPrefs(saved ? JSON.parse(saved) : defaults);
    } catch {
      setPrefs(defaults);
    }
  }
  function chooseFiles(chosen: File[]) {
    if (upload.isPending) return;
    setFiles(chosen);
    setUploadResults(chosen.map((file) => ({ file, status: "waiting" })));
    upload.reset();
  }
  const step = preview
    ? 3
    : files.length > 0 || upload.isPending
      ? 1
      : imports.data?.some((item) =>
            ["queued", "processing", "preview"].includes(item.status),
          )
        ? 2
        : 1;
  const rows = preview?.preview?.rows || [],
    start = (page - 1) * 100;
  return (
    <section id="imports">
      <header className="imports-heading">
        <div>
          <h1>Imports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload an export, check the extraction, then approve the rows.
          </p>
        </div>
        <ol className="import-steps" aria-label="Import workflow">
          {["Upload export", "Check extraction", "Approve rows"].map(
            (label, index) => (
              <li
                key={label}
                aria-current={step === index + 1 ? "step" : undefined}
              >
                <span>{index + 1}</span>
                {label}
              </li>
            ),
          )}
        </ol>
      </header>
      <form
        id="upload-form"
        className="import-upload-card"
        onSubmit={(e) => {
          e.preventDefault();
          upload.mutate({
            files: [...files],
            account,
            accountKind,
            options: structuredClone(prefs),
          });
        }}
      >
        <fieldset disabled={upload.isPending} className="import-form-body">
          <div className="import-upload-grid">
            <Field id="statement-file" label="Statement exports">
              <div
                className={`import-dropzone ${dragging ? "is-dragging" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!upload.isPending) setDragging(true);
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  chooseFiles(Array.from(event.dataTransfer.files));
                }}
              >
                <Input
                  ref={fileInput}
                  id="statement-file"
                  type="file"
                  accept=".csv,.pdf"
                  multiple
                  className="sr-only"
                  onChange={(event) =>
                    chooseFiles(Array.from(event.target.files || []))
                  }
                />
                <span className="import-upload-icon" aria-hidden="true">
                  <UploadCloud />
                </span>
                <p>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    onClick={() => fileInput.current?.click()}
                  >
                    Choose files
                  </Button>{" "}
                  or drag them here
                </p>
                <p className="text-xs text-muted-foreground">
                  CSVs or supported Chase credit-card PDFs · up to 25 MB each
                </p>
                {files.length > 0 && (
                  <p className="text-xs font-medium text-primary">
                    {files.length} {files.length === 1 ? "file" : "files"}{" "}
                    selected
                  </p>
                )}
              </div>
            </Field>
            <div className="space-y-5">
              <Field id="account-name" label="Account name">
                <Input
                  id="account-name"
                  list="account-list"
                  value={account}
                  onChange={(e) => accountChanged(e.target.value)}
                  required
                  maxLength={120}
                  placeholder="Chase •••• 2956"
                />
                <datalist id="account-list">
                  {bootstrap.accounts.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
                <p className="text-sm text-muted-foreground">
                  Use the same account name for repeated uploads.
                </p>
              </Field>
              <div className="space-y-2">
                <Label id="account-kind-label">Account type</Label>
                <div
                  className="account-kind-options"
                  role="radiogroup"
                  aria-labelledby="account-kind-label"
                  onKeyDown={(event) => {
                    if (
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                        "Home",
                        "End",
                      ].includes(event.key)
                    ) {
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? "credit"
                          : event.key === "End"
                            ? "checking"
                            : accountKind === "credit"
                              ? "checking"
                              : "credit";
                      setAccountKind(next);
                      event.currentTarget
                        .querySelector<HTMLButtonElement>(
                          `[data-account-kind="${next}"]`,
                        )
                        ?.focus();
                    }
                  }}
                >
                  {[
                    { value: "credit", label: "Credit card", icon: CreditCard },
                    {
                      value: "checking",
                      label: "Checking / bank",
                      icon: Landmark,
                    },
                  ].map((kind) => (
                    <Button
                      key={kind.value}
                      type="button"
                      variant="ghost"
                      role="radio"
                      data-account-kind={kind.value}
                      tabIndex={accountKind === kind.value ? 0 : -1}
                      aria-checked={accountKind === kind.value}
                      onClick={() => setAccountKind(kind.value)}
                    >
                      <kind.icon aria-hidden="true" />
                      <span>{kind.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <details className="import-format-options">
            <summary>
              <ChevronRight className="size-4" aria-hidden="true" />
              <span>
                CSV format and column mapping
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  Optional · set columns when automatic detection needs help
                </span>
              </span>
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="date-format" label="Date format">
                <NativeSelect
                  id="date-format"
                  value={prefs.date_format}
                  onChange={(e) =>
                    setPrefs({ ...prefs, date_format: e.target.value })
                  }
                >
                  {[
                    ["%m/%d/%Y", "MM/DD/YYYY"],
                    ["%m/%d/%y", "MM/DD/YY"],
                    ["%d/%m/%Y", "DD/MM/YYYY"],
                    ["%Y-%m-%d", "YYYY-MM-DD"],
                  ].map(([v, label]) => (
                    <NativeSelectOption key={v} value={v}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="amount-sign" label="Amount convention">
                <NativeSelect
                  id="amount-sign"
                  value={prefs.negative_expenses ? "negative" : "positive"}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      negative_expenses: e.target.value === "negative",
                    })
                  }
                >
                  <NativeSelectOption value="positive">
                    Expenses are positive
                  </NativeSelectOption>
                  <NativeSelectOption value="negative">
                    Expenses are negative
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              {["date", "description", "amount", "debit", "credit", "type"].map(
                (k) => (
                  <TextField
                    key={k}
                    id={"map-" + k}
                    label={k + " column"}
                    value={prefs.mapping[k] || ""}
                    placeholder="Auto-detect"
                    onChange={(v) =>
                      setPrefs({
                        ...prefs,
                        mapping: { ...prefs.mapping, [k]: v },
                      })
                    }
                  />
                ),
              )}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Enter exact CSV header names when automatic detection is
              insufficient. Debit/Credit columns take positive values.
            </p>
          </details>
        </fieldset>
        {uploadResults.length > 0 && (
          <div
            id="upload-results"
            className="import-results space-y-2"
            aria-live="polite"
            aria-busy={upload.isPending}
          >
            <p className="text-sm text-muted-foreground">
              {upload.isPending
                ? uploadResults.filter(
                    (r) => !["waiting", "uploading"].includes(r.status),
                  ).length +
                  " of " +
                  uploadResults.length +
                  " files processed"
                : files.length + " file(s) ready to upload"}
            </p>
            {uploadResults.map((result, index) => (
              <div
                key={index}
                data-upload-status={result.status}
                className="rounded-md border p-3"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="break-all">{result.file.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {
                      {
                        waiting: "Ready",
                        uploading: "Uploading…",
                        uploaded: "Uploaded · extraction queued",
                        duplicate: "Already uploaded",
                        failed: "Upload failed",
                      }[result.status]
                    }
                  </span>
                </div>
                <ErrorMessage error={result.error} />
              </div>
            ))}
          </div>
        )}
        <div className="px-5">
          <ErrorMessage error={upload.error} />
        </div>
        <footer className="import-form-footer">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            CSV preferences are saved in this browser for each account.
          </p>
          <Button
            disabled={upload.isPending || !files.length || !account.trim()}
          >
            {upload.isPending
              ? "Uploading…"
              : files.length > 0 &&
                  uploadResults.some((result) => result.status === "failed")
                ? "Retry failed uploads"
                : "Upload & preview"}
            <ArrowRight aria-hidden="true" />
          </Button>
        </footer>
      </form>
      <section className="import-archive" aria-label="Statement archive">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2>Statement archive</h2>
          {imports.data && (
            <p className="text-xs text-muted-foreground">
              {imports.data.length} statements ·{" "}
              {imports.data.reduce((total, item) => total + item.row_count, 0)}{" "}
              rows extracted
            </p>
          )}
        </header>
        <ErrorMessage error={open.error} />
        <ErrorMessage error={checkDuplicates.error} />
        <div id="import-list">
          {imports.isPending ? (
            <Loading />
          ) : imports.error ? (
            <ErrorMessage error={imports.error} />
          ) : imports.data.length ? (
            imports.data.map((item) => {
              const uploaded = new Date(item.created_at);
              const validDate = Number.isFinite(uploaded.getTime());
              return (
                <div key={item.id} className="import-archive-row">
                  <div
                    className="import-date"
                    aria-label={
                      validDate
                        ? `Uploaded ${uploaded.toLocaleDateString()}`
                        : "Upload date unavailable"
                    }
                  >
                    {validDate ? (
                      <>
                        <span>
                          {uploaded.toLocaleDateString("en-US", {
                            month: "short",
                          })}
                        </span>
                        <strong>{uploaded.getDate()}</strong>
                      </>
                    ) : (
                      <FileText aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong className="import-filename" title={item.filename}>
                      {item.filename}
                    </strong>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Import #{item.id}</span>
                      <span>{item.account}</span>
                      <span className={`import-status status-${item.status}`}>
                        <i aria-hidden="true" />
                        {(
                          {
                            committed: "Committed",
                            duplicates_removed: "Duplicates removed",
                            preview: "Ready to review",
                            queued: "Queued",
                            processing: "Processing",
                            failed: "Failed",
                          } as Record<string, string>
                        )[item.status] || item.status}
                      </span>
                      <span>
                        {item.row_count} extracted{" "}
                        {item.row_count === 1 ? "row" : "rows"}
                      </span>
                    </div>
                    <ErrorMessage error={item.error} />
                  </div>
                  <div className="import-archive-actions">
                    {item.status === "committed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={checkDuplicates.isPending}
                        onClick={() => checkDuplicates.mutate(item.id)}
                      >
                        Check duplicates
                      </Button>
                    )}
                    {item.status === "preview" && (
                      <Button
                        disabled={open.isPending}
                        onClick={() => open.mutate(item.id)}
                      >
                        Review import
                      </Button>
                    )}
                    <a href={`/api/imports/${item.id}/file`}>
                      <Download className="size-3.5" aria-hidden="true" />
                      Original file
                    </a>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="import-empty">
              <FileText className="mx-auto mb-3 size-6" aria-hidden="true" />
              <p>Your uploaded statements will appear here.</p>
            </div>
          )}
        </div>
      </section>
      <Modal
        title="Review duplicate import"
        open={!!duplicateReview}
        id="duplicate-import-modal"
        description="Remove an import only when every transaction has a matching copy."
        onOpenChange={() => {
          if (!removeDuplicates.isPending) setDuplicateReview(null);
        }}
      >
        {duplicateReview && (
          <div className="space-y-4">
            <p>
              Import #{duplicateReview.id} · {duplicateReview.account}
            </p>
            <p>
              {duplicateReview.matched_rows} of {duplicateReview.rows}{" "}
              transactions have matching copies in other imports for this
              account.
            </p>
            {duplicateReview.can_remove ? (
              <>
                <p>
                  Remove all {duplicateReview.rows} transactions from this
                  import, totaling {money(duplicateReview.spending_cents)} in
                  spending? Matching copies and the original statement file will
                  remain. Categorization edits on removed rows will not carry
                  over to the retained copies.
                </p>
                <Button
                  variant="destructive"
                  disabled={removeDuplicates.isPending}
                  onClick={() => removeDuplicates.mutate()}
                >
                  {removeDuplicates.isPending
                    ? "Removing…"
                    : "Remove duplicate import transactions"}
                </Button>
              </>
            ) : (
              <p>
                This import cannot be removed automatically because some
                transactions have no matching copies. No data has been changed.
              </p>
            )}
            <ErrorMessage error={removeDuplicates.error} />
          </div>
        )}
      </Modal>
      <Modal
        open={!!preview}
        onOpenChange={(v) => {
          if (!v && !commit.isPending) setPreview(null);
        }}
        id="preview-dialog"
        title="Review import"
        description="Check the extracted rows against your original statement."
      >
        <div id="preview-content" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <span>{selected.size} selected</span>
            <Button disabled={commit.isPending} onClick={() => commit.mutate()}>
              {commit.isPending ? "Working…" : "Import selected rows"}
            </Button>
          </div>
          <ErrorMessage error={commit.error} />
          <p>
            <strong>{preview?.filename}</strong> · {preview?.account}
          </p>
          <p className="text-sm text-muted-foreground">
            {rows.length} transactions. Possible duplicates are unchecked by
            default; keep them if they are separate purchases.
          </p>
          {!!preview?.preview?.warnings.length && (
            <div className="rounded-md bg-secondary p-4">
              <ul className="list-inside list-disc">
                {preview.preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <Label className="mt-3 min-h-11 leading-normal">
                <Checkbox
                  id="ack-warnings"
                  checked={ack}
                  onCheckedChange={(v) => setAck(!!v)}
                />
                I checked these warnings against the original statement
              </Label>
            </div>
          )}
          {!!preview?.preview?.reconciliation?.length && (
            <details>
              <summary>Statement totals and extraction</summary>
              {preview.preview.reconciliation.map((r) => (
                <p key={r.label}>
                  {r.label}: statement{" "}
                  {r.expected_cents === null
                    ? "unknown"
                    : money(r.expected_cents)}{" "}
                  · extracted {money(r.actual_cents)} · difference{" "}
                  {r.difference_cents === null
                    ? "unknown"
                    : money(r.difference_cents)}
                </p>
              ))}
              {preview.preview.unparsed_lines?.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </details>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/api/imports/${preview?.id}/file`}>Download original</a>
            <Button
              variant="outline"
              onClick={() => setSelected(new Set(rows.map((_, i) => i)))}
            >
              Select all rows
            </Button>
            <Button variant="outline" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
          <TransactionTable
            preview
            rows={rows.slice(start, start + 100)}
            offset={start}
            selected={selected}
            account={preview?.account}
            onSelect={(id, checked) =>
              setSelected((old) => {
                const next = new Set(old);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
              })
            }
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {Math.ceil(rows.length / 100)}
            </span>
            <Button
              variant="outline"
              disabled={start + 100 >= rows.length}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
