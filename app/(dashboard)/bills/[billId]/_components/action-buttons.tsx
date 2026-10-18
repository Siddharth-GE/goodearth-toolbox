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
import type { ActionState } from "@/lib/action-state";
import { approveBill, deleteBill, sendBackBill } from "@/lib/bills/actions";
import { canApprove, canDeleteBill, canSendBack, type BillStatus } from "@/lib/bills/workflow";
import { formatMoney } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

// Buttons come from lib/bills/workflow.ts; bills_guard() enforces every rule, so a hidden button is a courtesy.
export function ActionButtons({
  billId,
  status,
  actor,
  createdBy,
  totalAmount,
}: {
  billId: string;
  status: BillStatus;
  actor: { isAdmin: boolean; isApprover: boolean; approvalLimit: number | null; userId: string };
  createdBy: string | null;
  totalAmount: number;
}) {
  const { pending, error, run: runAction, clearError } = useActionRunner();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");

  const run = async (action: () => Promise<ActionState>) => {
    const result = await runAction(action);
    if (!result?.error) setSendingBack(false);
  };

  if (status === "approved") {
    const decider = canSendBack(status, actor);
    if (!decider) return null;
    return (
      <div className="space-y-1 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => setSendingBack(true)}>
            Send back
          </Button>
        </div>
        <FormMessage error={error} size="xs" />

        <Dialog
          open={sendingBack}
          onOpenChange={(open) => {
            setSendingBack(open);
            if (open) {
              setNote("");
              clearError();
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Send this bill back</DialogTitle>
              <DialogDescription>
                It returns to recorded so the figures can be fixed. Say what needs changing — the
                note shows at the top of the bill until it&apos;s approved again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 text-left">
              <Label htmlFor="send-back-note">Reason</Label>
              <Textarea
                id="send-back-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="The GST doesn't match the paper — check the invoice."
                rows={3}
                autoFocus
              />
            </div>
            <FormMessage error={error} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSendingBack(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                disabled={pending || !note.trim()}
                onClick={() => run(() => sendBackBill(billId, note))}
              >
                {pending ? "Sending back…" : "Send back"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const approvable = canApprove(status, actor, totalAmount);
  const deletable = canDeleteBill(status, actor, createdBy);
  // A named approver who is simply over their ceiling gets told so,
  // rather than watching the button quietly vanish.
  const overLimit =
    status === "recorded" && !approvable && (actor.isAdmin || actor.isApprover) && !actor.isAdmin;
  if (!approvable && !deletable && !overLimit) return null;

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
              onClick={() => run(() => deleteBill(billId))}
            >
              {pending ? "Deleting…" : "Delete bill"}
            </Button>
          </>
        ) : (
          <>
            {deletable && (
              <Button variant="ghost" disabled={pending} onClick={() => setConfirmingDelete(true)}>
                Delete
              </Button>
            )}
            {approvable && (
              <Button disabled={pending} onClick={() => run(() => approveBill(billId))}>
                {pending ? "Approving…" : "Approve"}
              </Button>
            )}
            {overLimit && (
              <span className="text-muted text-xs">
                Above your approval limit of {formatMoney(actor.approvalLimit)} — an admin or a
                higher approver decides this one.
              </span>
            )}
          </>
        )}
      </div>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
