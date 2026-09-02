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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveReconciliation } from "@/lib/estimator/estimate-actions";
import { useState, useTransition } from "react";

/**
 * Approve one "outside the estimate" arrival. Approval never clears
 * the flag — the entry sits in the estimate forever with its badge;
 * this records that an estimator has seen it, and why it was needed.
 */
export function ApproveReconciliationButton({
  estimateId,
  itemId,
  workItemId,
  itemName,
  workName,
}: {
  estimateId: string;
  itemId: string;
  workItemId: string | null;
  itemName: string;
  workName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setNote("");
          setError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Approve
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve this arrival?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            {itemName} reached this villa{workName ? ` for ${workName}` : ""}, but the official
            estimate never planned it. Approving records that you have seen it and stand by it — the
            &ldquo;outside the estimate&rdquo; flag stays on this estimate permanently either way.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reconciliation-note">Why was it needed? (optional)</Label>
            <Textarea
              id="reconciliation-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
          </div>
          <FormMessage error={error} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await approveReconciliation({
                  estimateId,
                  itemId,
                  workItemId,
                  note,
                });
                if (result?.error) setError(result.error);
                else setOpen(false);
              })
            }
          >
            {pending ? "Approving…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
