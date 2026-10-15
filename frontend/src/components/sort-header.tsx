import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table/table-head";
import { type SortState } from "@/lib/table-types";

export function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  numeric = false,
}: {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  numeric?: boolean;
}) {
  const active = sort.key === column,
    Icon = active
      ? sort.direction === "asc"
        ? ArrowUp
        : ArrowDown
      : ArrowUpDown;
  return (
    <TableHead
      className={numeric ? "data-numeric" : undefined}
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        className="data-sort-button"
        onClick={() => onSort(column)}
      >
        {label}
        <Icon aria-hidden="true" />
      </button>
    </TableHead>
  );
}
