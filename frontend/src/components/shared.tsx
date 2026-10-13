import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
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
export function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <p
      className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
      role="alert"
    >
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}
export function Loading() {
  return (
    <div aria-label="Loading" className="space-y-4 py-6">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
export function Modal({
  open,
  onOpenChange,
  id,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id={id}
        className="max-h-[85dvh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl"
        showCloseButton={false}
      >
        <DialogHeader className="flex-row flex-wrap items-center justify-between gap-4 text-left">
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="outline" data-close={id}>
              Close
            </Button>
          </DialogClose>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
