import { type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FilterFooter({
  onReset,
  children,
  status,
}: {
  onReset: () => void;
  children?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="transaction-filter-footer">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="outline" onClick={onReset}>
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
        {children}
      </div>
      <span className="transaction-filter-count" role="status">
        {status}
      </span>
    </div>
  );
}
