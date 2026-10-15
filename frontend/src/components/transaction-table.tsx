import { SortHeader } from "@/components/sort-header";
import { type SortState } from "@/lib/table-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table/table";
import { TableBody } from "@/components/ui/table/table-body";
import { TableCell } from "@/components/ui/table/table-cell";
import { TableHead } from "@/components/ui/table/table-head";
import { TableHeader } from "@/components/ui/table/table-header";
import { TableRow } from "@/components/ui/table/table-row";
import { money } from "@/lib/api";
import type { Transaction } from "@/lib/types";

export type TransactionSortKey =
  "date" | "vendor" | "account" | "category" | "amount_cents";
export function TransactionTable({
  rows,
  selected,
  onSelect,
  onSelectAll,
  onEdit,
  preview = false,
  offset = 0,
  account,
  sort,
  onSort,
}: {
  rows: Transaction[];
  selected: Set<number>;
  onSelect: (id: number, checked: boolean) => void;
  onSelectAll?: (checked: boolean) => void;
  onEdit?: (row: Transaction) => void;
  preview?: boolean;
  offset?: number;
  account?: string;
  sort?: SortState<TransactionSortKey>;
  onSort?: (key: TransactionSortKey) => void;
}) {
  const selectedOnPage = rows.filter((r, i) =>
    selected.has(preview ? offset + i : r.id),
  ).length;
  return (
    <Table className="ledger-table data-table">
      <TableHeader>
        <TableRow>
          <TableHead>
            {onSelectAll ? (
              <label className="flex items-center gap-2">
                <Checkbox
                  aria-label="Select all transactions on this page"
                  disabled={!rows.length}
                  checked={
                    rows.length > 0 && selectedOnPage === rows.length
                      ? true
                      : selectedOnPage > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(value) => onSelectAll(value === true)}
                />
                Select all
              </label>
            ) : (
              "Select"
            )}
          </TableHead>
          {(
            [
              ["date", "Date"],
              ["vendor", "Merchant / description"],
              ["account", "Account"],
              ["category", "Category / type"],
              ["amount_cents", "Amount"],
            ] as [TransactionSortKey, string][]
          ).map(([key, label]) =>
            sort && onSort ? (
              <SortHeader
                key={key}
                column={key}
                label={label}
                sort={sort}
                onSort={onSort}
                numeric={key === "amount_cents"}
              />
            ) : (
              <TableHead key={key}>{label}</TableHead>
            ),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => {
          const id = preview ? offset + i : r.id;
          return (
            <TableRow key={id}>
              <TableCell data-label="Select">
                <Checkbox
                  checked={selected.has(id)}
                  onCheckedChange={(v) => onSelect(id, !!v)}
                  aria-label={`Select ${r.vendor} on ${r.date}`}
                  {...(preview
                    ? { "data-preview-row": id }
                    : { "data-row": id })}
                />
              </TableCell>
              <TableCell data-label="Date">
                {preview ? (
                  r.date
                ) : (
                  <time dateTime={r.date}>
                    <span>
                      {new Date(r.date + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" },
                      )}
                    </span>
                    <small className="block text-muted-foreground">
                      {r.date.slice(0, 4)}
                    </small>
                  </time>
                )}
              </TableCell>
              <TableCell data-label="Merchant">
                {onEdit ? (
                  <Button
                    variant="link"
                    className="h-auto px-0 text-left"
                    data-edit={r.id}
                    onClick={() => onEdit(r)}
                  >
                    {r.vendor}
                  </Button>
                ) : (
                  r.vendor
                )}
                <span className="block max-w-[50ch] whitespace-normal text-muted-foreground">
                  {r.description}
                </span>
                {r.duplicate_candidate && (
                  <Badge variant="secondary">Possible duplicate</Badge>
                )}
              </TableCell>
              <TableCell data-label="Account">{account || r.account}</TableCell>
              <TableCell data-label="Category">
                <span className="transaction-category-pill">{r.category}</span>
                <span className="block text-muted-foreground transaction-kind">
                  {r.kind}
                  {["payment", "transfer", "income"].includes(r.kind)
                    ? " · not spending"
                    : ""}
                </span>
                {r.needs_review && (
                  <Badge variant="secondary">Needs review</Badge>
                )}
              </TableCell>
              <TableCell
                data-label="Amount"
                className={`text-right tabular-nums ${r.amount_cents < 0 ? "transaction-credit" : ""}`}
              >
                {money(r.amount_cents)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
