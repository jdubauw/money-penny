import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog/dialog";
import { DialogContent } from "@/components/ui/dialog/dialog-content";
import { DialogHeader } from "@/components/ui/dialog/dialog-header";
import { DialogTitle } from "@/components/ui/dialog/dialog-title";
import { DialogDescription } from "@/components/ui/dialog/dialog-description";
import { DialogClose } from "@/components/ui/dialog/dialog-close";

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
