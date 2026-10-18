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
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

/** A mistyped receipt must be removable (that is why the delete policy exists), but not on one click. The audit trigger keeps the before-image. */
export function DeleteReceiptButton({ receiptId, amount }: { receiptId: string; amount: string }) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useActionRunner();

  const remove = async () => {
    const result = await run(() => deleteReceipt(receiptId));
    if (result?.error) return;
    setOpen(false);
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
            {/* Secondary + text-danger is the house's destructive button; DESIGN.md refuses a one-off `danger` variant. */}
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
