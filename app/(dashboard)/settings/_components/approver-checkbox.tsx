"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { setIndentApprover } from "@/lib/settings/actions";
import { useState, useTransition } from "react";

/**
 * The "Approve indents" switch — a sibling of GrantCheckbox with the
 * same controlled/rollback behaviour, calling one action with a boolean
 * instead of two.
 */
export function ApproverCheckbox({ userId, isApprover }: { userId: string; isApprover: boolean }) {
  const [isPending, startTransition] = useTransition();
  // Controlled, not defaultChecked — the state the server actually
  // confirmed, rolled back if the write fails (see GrantCheckbox).
  const [checked, setChecked] = useState(isApprover);
  const [error, setError] = useState<string>();

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <Checkbox
        checked={checked}
        disabled={isPending}
        aria-label={`${checked ? "Remove" : "Make"} indent approver`}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          setError(undefined);
          startTransition(async () => {
            const result = await setIndentApprover(userId, next);
            if (result?.error) {
              setChecked(!next);
              setError(result.error);
            }
          });
        }}
      />
      {error && (
        <span role="alert" className="text-danger text-[10px] leading-tight font-medium">
          {error}
        </span>
      )}
    </div>
  );
}
