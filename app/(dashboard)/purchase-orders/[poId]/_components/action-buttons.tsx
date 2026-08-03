"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { deleteDraftPo } from "@/lib/purchase-orders/actions";
import { canDeleteDraft, type PoActor, type PoStatus } from "@/lib/purchase-orders/workflow";
import { useState, useTransition } from "react";

/**
 * Everything that changes a PO's status, in one place. M2 covers the
 * draft's own delete; Issue and the request-deletion → admin-approve
 * flow land in M3. Which buttons appear comes from
 * lib/purchase-orders/workflow.ts; every rule is enforced again by the
 * database guards, so a hidden button is a courtesy.
 */
export function ActionButtons({
  poId,
  status,
  actor,
  createdBy,
}: {
  poId: string;
  status: PoStatus;
  actor: PoActor;
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

  if (!canDeleteDraft(status, actor, createdBy)) return null;

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
          <Button variant="ghost" disabled={pending} onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
