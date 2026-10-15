import { type ReactNode } from "react";
import { Table } from "@/components/ui/table/table";
import { TableBody } from "@/components/ui/table/table-body";
import { TableCell } from "@/components/ui/table/table-cell";
import { TableHead } from "@/components/ui/table/table-head";
import { TableHeader } from "@/components/ui/table/table-header";
import { TableRow } from "@/components/ui/table/table-row";
import { type SortState } from "@/lib/table-types";
import { type DataColumn } from "@/lib/table-types";
import { SortHeader } from "@/components/sort-header";

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
