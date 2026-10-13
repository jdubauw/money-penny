import type { ComponentProps, ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export function SheetContent({
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { children: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="sheet-overlay" />
      <DialogPrimitive.Content className="sheet-content" {...props}>
        <DialogPrimitive.Title className="sr-only">
          Navigation menu
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">
          Navigate your spending reports, transactions, imports, and AI
          settings.
        </DialogPrimitive.Description>
        <DialogPrimitive.Close asChild>
          <Button
            variant="ghost"
            className="absolute right-3 top-4 size-11 p-0"
            aria-label="Close menu"
          >
            <X />
          </Button>
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
