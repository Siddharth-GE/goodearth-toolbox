"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { deleteIndent, submitIndent } from "@/lib/indents/actions";
import { canEditIndent, canSubmit, type IndentStatus } from "@/lib/indents/workflow";
import { useState, useTransition } from "react";

/**
 * Draft-state actions only — approve/reject arrive in M5. The disabled
 * states mirror lib/indents/workflow.ts, and every rule is enforced
 * again in the database guard: a disabled button is a courtesy, not a
 * rule.
 */
export function ActionButtons({
  indentId,
  status,
  lineCount,
}: {
  indentId: string;
  status: IndentStatus;
  lineCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string>();

  if (!canEditIndent(status)) return null;

  const submit = () =>
    startTransition(async () => {
      const result = await submitIndent(indentId);
      if (result?.error) setError(result.error);
    });

  const remove = () =>
    startTransition(async () => {
      // A success redirects to the list, so only errors come back.
      const result = await deleteIndent(indentId);
      if (result?.error) setError(result.error);
    });

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
              onClick={remove}
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
              onClick={submit}
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
