import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type Target } from "@/lib/report-types";

export function TargetEditor({
  target,
  save,
  pending,
}: {
  target: Target;
  save: (category: string, percent: number) => void;
  pending: boolean;
}) {
  const [percent, setPercent] = useState(String(target.percent));
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save(target.category, Number(percent));
      }}
    >
      <input
        className="w-20 rounded border bg-background p-2"
        aria-label={`${target.category} reduction percent`}
        type="number"
        min="0"
        max="100"
        step="0.1"
        value={percent}
        onChange={(e) => setPercent(e.target.value)}
        required
      />
      <span>%</span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || Number(percent) === target.percent}
      >
        Save
      </Button>
    </form>
  );
}
