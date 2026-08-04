"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { deleteBill } from "@/lib/bills/actions";
import { canDeleteBill, type BillStatus } from "@/lib/bills/workflow";
import { useState, useTransition } from "react";

/**
 * Everything that changes a bill's status, in one place.
 *
 * Which buttons appear comes from lib/bills/workflow.ts; every rule is
 * enforced again by bills_guard() in the database, so a hidden button
 * is a courtesy and the trigger is the actual boundary.
 */
export function ActionButtons({
  billId,
  status,
  actor,
  createdBy,
}: {
  billId: string;
  status: BillStatus;
  actor: { isAdmin: boolean; isApprover: boolean; userId: string };
  createdBy: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string>();

  const run = (action: () => Promise<{ error?: string } | undefined>) =>
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });

  const deletable = canDeleteBill(status, actor, createdBy);
  if (!deletable) return null;

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
          <Button variant="ghost" disabled={pending} onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
