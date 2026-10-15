/* Hallmark · pre-emit critique: P4 H4 E4 S5 R5 V3 · design-system: design.md */
import { Field } from "@/components/shared";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type SortState<K extends string = string> = {
  key: K;
  direction: "asc" | "desc";
};
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
export function SortSelect<K extends string>({
  id,
  columns,
  sort,
  onChange,
}: {
  id: string;
  columns: { key: K; label: string }[];
  sort: SortState<K>;
  onChange: (sort: SortState<K>) => void;
}) {
  return (
    <Field id={id} label="Sort by">
      <NativeSelect
        id={id}
        value={`${sort.key}:${sort.direction}`}
        onChange={(e) => {
          const [key, direction] = e.target.value.split(":");
          onChange({ key: key as K, direction: direction as "asc" | "desc" });
        }}
      >
        {columns.flatMap((c) =>
          (["asc", "desc"] as const).map((direction) => (
            <NativeSelectOption
              key={`${c.key}:${direction}`}
              value={`${c.key}:${direction}`}
            >
              {c.label} · {direction === "asc" ? "ascending" : "descending"}
            </NativeSelectOption>
          )),
        )}
      </NativeSelect>
    </Field>
  );
}
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
export type DataColumn<T, K extends string> = {
  key: K;
  label: string;
  numeric?: boolean;
  render: (row: T) => ReactNode;
};
export function DataTable<T, K extends string>({
  rows,
  columns,
  rowKey,
  sort,
  onSort,
  empty,
  actions,
}: {
  rows: T[];
  columns: DataColumn<T, K>[];
  rowKey: (row: T) => string;
  sort: SortState<K>;
  onSort: (key: K) => void;
  empty: string;
  actions?: (row: T) => ReactNode;
}) {
  return (
    <div className="data-table-card report-table">
      <Table className="data-table">
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <SortHeader
                key={c.key}
                column={c.key}
                label={c.label}
                numeric={c.numeric}
                sort={sort}
                onSort={onSort}
              />
            ))}
            {actions && (
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={rowKey(r)}>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  className={c.numeric ? "data-numeric" : undefined}
                >
                  {c.render(r)}
                </TableCell>
              ))}
              {actions && <TableCell>{actions(r)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!rows.length && (
        <p className="p-6 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
