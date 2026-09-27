"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { useState, useTransition, type ReactNode } from "react";

/**
 * "Are you sure?" for the presses in this tool that throw work away —
 * a draft drawing and its sheets, a whole draft transmittal. It names
 * what will go before it goes, and keeps any refusal inside the dialog.
 *
 * Local to Design Management on purpose: two uses in one tool. DESIGN.md
 * builds the third copy into components/ui, not the first.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => Promise<{ error?: string } | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(undefined);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            className="bg-danger text-danger-foreground hover:bg-danger/90"
            disabled={pending}
            onClick={() => {
              setError(undefined);
              startTransition(async () => {
                const result = await onConfirm();
                if (result?.error) setError(result.error);
                else setOpen(false);
              });
            }}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
