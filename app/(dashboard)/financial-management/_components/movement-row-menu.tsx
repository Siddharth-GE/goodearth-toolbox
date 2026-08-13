"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { deleteMovement } from "@/lib/financial-management/actions";
import { Trash2 } from "lucide-react";
import { useState } from "react";

/**
 * Remove one movement — a mistyped payment must be correctable. Asks
 * first: this is a rupee record, and the audit trail keeping the
 * before-image is for accidents, not a routine.
 */
export function MovementRowMenu({
  movementId,
  facilityId,
  describedAs,
}: {
  movementId: string;
  facilityId: string;
  /** "Drawdown of ₹25,00,000 on 3 Aug 2026" — read back in the confirm. */
  describedAs: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onDelete() {
    setBusy(true);
    setError(undefined);
    const result = await deleteMovement(movementId, facilityId);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setConfirming(false);
  }

  return (
    <>
      <IconButton
        aria-label={`Remove ${describedAs}`}
        size="sm"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
      </IconButton>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this movement?</DialogTitle>
            <DialogDescription>
              {describedAs} will be removed and every balance recomputed. This is for fixing a
              mistyped entry, not for undoing history.
            </DialogDescription>
          </DialogHeader>
          <FormMessage error={error} />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
            <Button onClick={onDelete} disabled={busy}>
              {busy ? "Removing…" : "Remove movement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
