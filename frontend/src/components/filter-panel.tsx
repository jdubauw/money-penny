import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FilterPanel({
  children,
  label = "Filter transactions",
  id = "ledger-filter-content",
}: {
  children: ReactNode;
  label?: string;
  id?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="filter-panel data-filter-panel">
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-between md:hidden"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          {label}
        </span>
        <ChevronDown className={expanded ? "size-4 rotate-180" : "size-4"} />
      </Button>
      <div id={id} className={expanded ? "block" : "hidden md:block"}>
        {children}
      </div>
    </section>
  );
}
