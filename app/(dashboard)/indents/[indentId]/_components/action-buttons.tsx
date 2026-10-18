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
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { approveIndent, deleteIndent, rejectIndent, submitIndent } from "@/lib/indents/actions";
import { canDecide, canEditIndent, canSubmit, type IndentStatus } from "@/lib/indents/workflow";
import { useState } from "react";

// Buttons come from lib/indents/workflow.ts; indents_guard() enforces every rule, so a hidden button is a courtesy.
export function ActionButtons({
  indentId,
  status,
  lineCount,
  decider,
  approvalBlocker,
}: {
  indentId: string;
  status: IndentStatus;
  lineCount: number;
  decider: { isAdmin: boolean; isApprover: boolean };
  /** Why Approve is locked (0113: lines outside the estimate wait for the estimator); Send back stays open. */
  approvalBlocker: string | null;
}) {
  const { pending, error, run: runAction, clearError } = useActionRunner();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const run = async (action: () => Promise<ActionState>) => {
    const result = await runAction(action);
    if (!result?.error) setRejecting(false);
  };

  if (canDecide(status, decider)) {
    return (
      <div className="space-y-1 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => setRejecting(true)}>
            Send back
          </Button>
          <Button
            disabled={pending || approvalBlocker !== null}
            title={approvalBlocker ?? undefined}
            onClick={() => run(() => approveIndent(indentId))}
          >
            {pending ? "Approving…" : "Approve"}
          </Button>
        </div>
        {approvalBlocker && <p className="text-muted text-xs">{approvalBlocker}</p>}
        <FormMessage error={error} size="xs" />

        <Dialog
          open={rejecting}
          onOpenChange={(open) => {
            setRejecting(open);
            if (open) {
              setNote("");
              clearError();
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Send this indent back</DialogTitle>
              <DialogDescription>
                It returns to draft so the site team can fix it. Say what needs changing — they see
                this note at the top of the indent.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 text-left">
              <Label htmlFor="rejection-note">Reason</Label>
              <Textarea
                id="rejection-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Quantities look high for this stage — check against the plan."
                rows={3}
                autoFocus
              />
            </div>
            <FormMessage error={error} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRejecting(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                disabled={pending || !note.trim()}
                onClick={() => run(() => rejectIndent(indentId, note))}
              >
                {pending ? "Sending back…" : "Send back"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (!canEditIndent(status)) return null;

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
              onClick={() => run(() => deleteIndent(indentId))}
            >
              {pending ? "Deleting…" : "Delete draft"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
            <Button
              disabled={pending || !canSubmit(status, lineCount)}
              title={lineCount === 0 ? "Add at least one line first" : undefined}
              onClick={() => run(() => submitIndent(indentId))}
            >
              {pending ? "Submitting…" : "Submit for approval"}
            </Button>
          </>
        )}
      </div>
      {lineCount === 0 && !confirmingDelete && (
        <p className="text-muted text-xs">Add at least one line to submit</p>
      )}
      <FormMessage error={error} size="xs" />
    </div>
  );
}
