import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/lib/api";
import type { Transaction } from "@/lib/types";
export function TransactionTable({
  rows,
  selected,
  onSelect,
  onEdit,
  preview = false,
  offset = 0,
  account,
}: {
  rows: Transaction[];
  selected: Set<number>;
  onSelect: (id: number, checked: boolean) => void;
  onEdit?: (row: Transaction) => void;
  preview?: boolean;
  offset?: number;
  account?: string;
}) {
  return (
    <Table className="ledger-table">
      <TableHeader>
        <TableRow>
          {[
            "Select",
            "Date",
            "Merchant / description",
            "Account",
            "Category / type",
            "Amount",
          ].map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
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
              <TableCell data-label="Date">{r.date}</TableCell>
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
                {r.category}
                <span className="block text-muted-foreground">{r.kind}</span>
                {r.needs_review && (
                  <Badge variant="secondary">Needs review</Badge>
                )}
              </TableCell>
              <TableCell
                data-label="Amount"
                className="text-right tabular-nums"
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
