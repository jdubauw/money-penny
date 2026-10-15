export function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <p
      className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
      role="alert"
    >
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}
