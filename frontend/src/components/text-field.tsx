import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";

export function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  ...props
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  step?: string;
}) {
  return (
    <Field id={id} label={label}>
      <Input
        id={id}
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </Field>
  );
}
