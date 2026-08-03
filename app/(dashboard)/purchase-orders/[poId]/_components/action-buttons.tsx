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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  approvePoDeletion,
  deleteDraftPo,
  issuePo,
  requestPoDeletion,
  withdrawPoDeletion,
} from "@/lib/purchase-orders/actions";
import {
  canApproveDeletion,
  canDeleteDraft,
  canIssue,
  canRequestDeletion,
  canWithdrawDeletion,
  type PoActor,
  type PoStatus,
} from "@/lib/purchase-orders/workflow";
import { useState, useTransition } from "react";

/**
 * Everything that changes a PO's status, in one place. Which buttons
 * appear comes from lib/purchase-orders/workflow.ts; every rule is
 * enforced again by purchase_orders_guard in the database, so a hidden
 * button is a courtesy and the trigger is the actual boundary.
 */
export function ActionButtons({
  poId,
  status,
  actor,
  createdBy,
  deletionRequestedBy,
  lineCount,
  fullyPriced,
}: {
  poId: string;
  status: PoStatus;
  actor: PoActor;
  createdBy: string | null;
  deletionRequestedBy: string | null;
  lineCount: number;
  fullyPriced: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  const run = (action: () => Promise<{ error?: string } | undefined>) =>
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
      else setRequesting(false);
    });

  // ---- Deletion requested: the admin's decision, or a withdrawal -----
  if (status === "deletion_requested") {
    const mayWithdraw = canWithdrawDeletion(status, actor, deletionRequestedBy);
    const mayApprove = canApproveDeletion(status, actor);
    if (!mayWithdraw && !mayApprove) return null;
    return (
      <div className="space-y-1 text-right">
        <div className="flex items-center justify-end gap-2">
          {confirmingCancel ? (
            <>
              <span className="text-muted text-xs">
                Its lines go back to the unordered pool — sure?
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setConfirmingCancel(false)}
              >
                Keep it
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-danger"
                disabled={pending}
                onClick={() => run(() => approvePoDeletion(poId))}
              >
                {pending ? "Cancelling…" : "Approve deletion"}
              </Button>
            </>
          ) : (
            <>
              {mayWithdraw && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => withdrawPoDeletion(poId))}
                >
                  {actor.isAdmin && deletionRequestedBy !== actor.userId
                    ? "Refuse request"
                    : "Withdraw request"}
                </Button>
              )}
              {mayApprove && (
                <Button
                  variant="secondary"
                  className="text-danger"
                  disabled={pending}
                  onClick={() => setConfirmingCancel(true)}
                >
                  Approve deletion
                </Button>
              )}
            </>
          )}
        </div>
        <FormMessage error={error} size="xs" />
      </div>
    );
  }

  // ---- Issued: anyone with the app may ask for its removal ----------
  if (canRequestDeletion(status)) {
    return (
      <div className="space-y-1 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => setRequesting(true)}>
            Delete…
          </Button>
        </div>
        <FormMessage error={error} size="xs" />

        <Dialog
          open={requesting}
          onOpenChange={(open) => {
            setRequesting(open);
            if (open) {
              setNote("");
              setError(undefined);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ask to delete this purchase order</DialogTitle>
              <DialogDescription>
                It has been issued, so removing it takes an admin&apos;s approval. Say why — the
                admin decides from this note, and the vendor may already be acting on the order.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 text-left">
              <Label htmlFor="deletion-note">Reason</Label>
              <Textarea
                id="deletion-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Vendor can't supply — re-ordering from another."
                rows={3}
                autoFocus
              />
            </div>
            <FormMessage error={error} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRequesting(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                disabled={pending || !note.trim()}
                onClick={() => run(() => requestPoDeletion(poId, note))}
              >
                {pending ? "Requesting…" : "Request deletion"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ---- Draft: issue it, or throw it away ----------------------------
  if (status !== "draft") return null;
  const mayDelete = canDeleteDraft(status, actor, createdBy);

  return (
    <div className="space-y-1 text-right">
      <div className="flex items-center justify-end gap-2">
        {confirmingDelete ? (
          <>
            <span className="text-muted text-xs">Its number stays used — sure?</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmingDelete(false)}
            >
              Keep it
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-danger"
              disabled={pending}
              onClick={() => run(() => deleteDraftPo(poId))}
            >
              {pending ? "Deleting…" : "Delete draft"}
            </Button>
          </>
        ) : (
          <>
            {mayDelete && (
              <Button variant="ghost" disabled={pending} onClick={() => setConfirmingDelete(true)}>
                Delete
              </Button>
            )}
            <Button
              disabled={pending || !canIssue(status, lineCount, fullyPriced)}
              title={
                lineCount === 0
                  ? "Add at least one line first"
                  : !fullyPriced
                    ? "Every line needs a rate and a GST % first"
                    : undefined
              }
              onClick={() => run(() => issuePo(poId))}
            >
              {pending ? "Issuing…" : "Issue to vendor"}
            </Button>
          </>
        )}
      </div>
      {!confirmingDelete && lineCount === 0 && (
        <p className="text-muted text-xs">Add at least one line to issue</p>
      )}
      {!confirmingDelete && lineCount > 0 && !fullyPriced && (
        <p className="text-muted text-xs">Every line needs a rate and GST to issue</p>
      )}
      <FormMessage error={error} size="xs" />
    </div>
  );
}
