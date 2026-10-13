import { api, ApiError } from "./api";
import type { ImportRecord } from "./types";

export interface UploadResult {
  file: File;
  status: "waiting" | "uploading" | "uploaded" | "duplicate" | "failed";
  item?: ImportRecord;
  error?: string;
}
export interface UploadBatch {
  files: File[];
  account: string;
  accountKind: string;
  options: unknown;
}

/** Separate requests preserve per-file limits and permit independent retries. */
export async function uploadStatements(
  batch: UploadBatch,
  onProgress: (results: UploadResult[]) => void,
): Promise<UploadResult[]> {
  const results: UploadResult[] = batch.files.map((file) => ({
    file,
    status: "waiting",
  }));
  const publish = () => onProgress(results.map((result) => ({ ...result })));
  publish();
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    result.status = "uploading";
    publish();
    try {
      if (!/\.(csv|pdf)$/i.test(result.file.name))
        throw new Error("Choose a CSV or PDF file.");
      if (result.file.size > 25 * 1024 * 1024)
        throw new Error("Maximum upload size is 25 MB per file.");
      if (!result.file.size) throw new Error("This file is empty.");
      const body = new FormData();
      body.set("file", result.file);
      body.set("account", batch.account);
      body.set("account_kind", batch.accountKind);
      body.set("options", JSON.stringify(batch.options));
      const item = await api<ImportRecord & { already_uploaded?: boolean }>(
        "/api/imports",
        { method: "POST", body },
      );
      result.item = item;
      result.status = item.already_uploaded ? "duplicate" : "uploaded";
    } catch (error) {
      result.status = "failed";
      result.error = error instanceof Error ? error.message : "Upload failed.";
      if (error instanceof ApiError && error.status === 401) {
        for (const remaining of results.slice(index + 1)) {
          remaining.status = "failed";
          remaining.error = "Not uploaded. Sign in before retrying.";
        }
        publish();
        break;
      }
    }
    publish();
  }
  return results;
}
