export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "X-Requested-With": "SpendingLedger",
  };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const response = await fetch(path, {
    method: options.method,
    body,
    headers,
    signal: options.signal,
    credentials: "same-origin",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 401 && path !== "/api/login")
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      typeof data?.detail === "string"
        ? data.detail
        : `Request failed (${response.status}). Check your form values.`,
      response.status,
    );
  }
  return response.json();
}
export function queryString(
  filters: Record<string, string>,
  extra: Record<string, string> = {},
) {
  return new URLSearchParams(
    Object.entries({ ...filters, ...extra }).filter(([, v]) => v !== ""),
  ).toString();
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
