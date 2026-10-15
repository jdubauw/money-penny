import { Field } from "@/components/field";
import { NativeSelect } from "@/components/ui/native-select/native-select";
import { NativeSelectOption } from "@/components/ui/native-select/native-select-option";
import { type SortState } from "@/lib/table-types";

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
