import { NativeSelect } from "@/components/ui/native-select/native-select";
import { NativeSelectOption } from "@/components/ui/native-select/native-select-option";
import { Field } from "@/components/field";

export function SelectField({
  id,
  label,
  values,
  value,
  onChange,
  empty,
}: {
  id: string;
  label: string;
  values: string[];
  value: string;
  onChange: (v: string) => void;
  empty?: string;
}) {
  return (
    <Field id={id} label={label}>
      <NativeSelect
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
      >
        {empty !== undefined && (
          <NativeSelectOption value="">{empty}</NativeSelectOption>
        )}
        {values.map((v) => (
          <NativeSelectOption key={v} value={v}>
            {v}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
