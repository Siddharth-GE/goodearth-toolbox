"use client";

import { Button } from "@/components/ui/button";
import { approveLabourContract, setLabourContractActive } from "@/lib/bills/actions";
import { useState, useTransition } from "react";

/**
 * The per-row contract actions: approve (deciders only — the DB guard
 * re-checks) and the active toggle. Terms editing lives in the dialog
 * and only while pending; once approved, deactivate-and-record-anew is
 * the correction path.
 */
export function ContractActions({
  contractId,
  isActive,
  showApprove,
}: {
  contractId: string;
  isActive: boolean;
  showApprove: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const run = (action: () => Promise<{ error?: string } | undefined>) =>
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {showApprove && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => approveLabourContract(contractId))}
          >
            {pending ? "Approving…" : "Approve"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => setLabourContractActive(contractId, !isActive))}
        >
          {isActive ? "Deactivate" : "Reactivate"}
        </Button>
      </div>
      {error && (
        <span role="alert" className="text-danger text-[10px] leading-tight font-medium">
          {error}
        </span>
      )}
    </div>
  );
}
