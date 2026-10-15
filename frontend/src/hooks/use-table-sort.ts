import { useState } from "react";
import { type SortState } from "@/lib/table-types";

export function useTableSort<T, K extends string>(
  initial: SortState<K>,
  values: Record<K, (row: T) => string | number | null>,
) {
  const [sort, setSort] = useState(initial);
  const onSort = (key: K) =>
    setSort((s) => ({
      key,
      direction:
        s.key === key ? (s.direction === "asc" ? "desc" : "asc") : "asc",
    }));
  const sorted = (rows: T[]) =>
    [...rows].sort((a, b) => {
      const x = values[sort.key](a),
        y = values[sort.key](b);
      if (x == null) return y == null ? 0 : 1;
      if (y == null) return -1;
      return (
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y))) *
        (sort.direction === "asc" ? 1 : -1)
      );
    });
  return { sort, onSort, sorted };
}
