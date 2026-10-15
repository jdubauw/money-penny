import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { money } from "@/lib/api";

export function SpendingChange({
  before,
  after,
  valid,
}: {
  before: number;
  after: number;
  valid: boolean;
}) {
  if (!valid) return <span className="text-muted-foreground">—</span>;
  const delta = after - before;
  return (
    <span
      className={`dashboard-change ${delta < 0 ? "is-lower" : delta > 0 ? "is-higher" : ""}`}
    >
      <span className="flex items-center justify-end gap-1">
        {delta < 0 ? (
          <ArrowDownRight className="size-3" />
        ) : delta > 0 ? (
          <ArrowUpRight className="size-3" />
        ) : null}
        {money(Math.abs(delta))}
      </span>
      {before > 0 && (
        <span className="block text-[11px]">
          {Math.abs((delta / before) * 100).toFixed(1)}%
        </span>
      )}
    </span>
  );
}
