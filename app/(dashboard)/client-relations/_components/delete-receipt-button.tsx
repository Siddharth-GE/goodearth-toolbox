"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { deleteReceipt } from "@/lib/client-relations/actions";
import { useState, useTransition } from "react";

/**
 * Removing a recorded payment asks first.
 *
 * A mistyped receipt has to be removable — that is why the delete policy
 * exists — but deleting money on a single click is how a real payment
 * disappears. The audit trigger keeps the before-image either way.
 */
export function DeleteReceiptButton({ receiptId, amount }: { receiptId: string; amount: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const remove = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await deleteReceipt(receiptId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="h-8 px-2 text-xs">
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this payment?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-muted text-sm">
            {amount} will stop counting towards what this plot has paid. Only do this if it was
            recorded by mistake.
          </p>
          <FormMessage error={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Keep it</Button>
            </DialogClose>
            {/* Secondary + text-danger is the house's destructive button —
                there is no `danger` variant, and adding one for a single
                call site is exactly the speculative component DESIGN.md
                refuses. */}
            <Button
              type="button"
              variant="secondary"
              className="text-danger"
              onClick={remove}
              disabled={pending}
            >
              {pending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
