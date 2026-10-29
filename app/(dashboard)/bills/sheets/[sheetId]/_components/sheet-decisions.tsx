"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { approveSheet, sendBackSheet, undoSheet } from "@/lib/bills/sheet-actions";
import type { SheetState } from "@/lib/bills/sheets";
import { formatMoney } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useRouter } from "next/navigation";

// approve_bill_sheet, send_back_bill_sheet and undo_bill_sheet (0170) hold every rule; a hidden button is a courtesy.
export function SheetDecisions({
  sheetId,
  reference,
  state,
  total,
  billCount,
  hasMoney,
  onCashRequest,
  actor,
}: {
  sheetId: string;
  reference: string;
  state: SheetState;
  total: number;
  billCount: number;
  /** Paid (even reversed): it is never undone, only sent back while its money nets to nothing. */
  hasMoney: boolean;
  onCashRequest: boolean;
  actor: { isAdmin: boolean; isApprover: boolean; approvalLimit: number | null };
}) {
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const decider = actor.isAdmin || actor.isApprover;
  const overLimit =
    !actor.isAdmin && actor.approvalLimit !== null && total > actor.approvalLimit + 0.005;
  const after = (result: { error?: string } | undefined) => {
    if (!result?.error) router.refresh();
    return result;
  };

  const undoable =
    (state === "waiting" || (state === "approved" && decider)) && !hasMoney && !onCashRequest;

  return (
    <div className="space-y-1 text-right">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {undoable && (
          <ConfirmDialog
            trigger={<Button variant="secondary">Undo</Button>}
            title={`Undo ${reference}?`}
            description={`Its ${billCount === 1 ? "bill stands" : `${billCount} bills stand`} alone again, waiting for approval, and can be consolidated again. The sheet stays on record as undone, with the bills it had; its number is not used again.`}
            confirmLabel="Undo the sheet"
            pendingLabel="Undoing…"
            onConfirm={async () => after(await undoSheet(sheetId))}
          />
        )}
        {state === "approved" && decider && (
          <ConfirmDialog
            trigger={<Button variant="secondary">Send back</Button>}
            title={`Send ${reference} back`}
            description="It and its bills return to waiting for approval, so a bill can be corrected or taken off. The note shows on the sheet and on each bill until it is approved again."
            confirmLabel="Send back"
            pendingLabel="Sending back…"
            tone="primary"
            reason={{ label: "What needs changing", placeholder: "Villa 24's rate is wrong." }}
            onConfirm={async (note) => after(await sendBackSheet(sheetId, note))}
          />
        )}
        {state === "waiting" && decider && !overLimit && billCount > 0 && (
          <Button
            disabled={pending}
            onClick={async () => after(await run(() => approveSheet(sheetId)))}
          >
            {pending ? "Approving…" : `Approve ${formatMoney(total)}`}
          </Button>
        )}
      </div>
      {state === "waiting" && decider && overLimit && (
        <p className="text-muted text-xs">
          {`Above your approval limit of ${formatMoney(actor.approvalLimit)} — an admin or a higher approver decides this one.`}
        </p>
      )}
      {state === "waiting" && !decider && (
        <p className="text-muted text-xs">Waiting for a named bill approver or an admin.</p>
      )}
      <FormMessage error={error} size="xs" />
    </div>
  );
}
