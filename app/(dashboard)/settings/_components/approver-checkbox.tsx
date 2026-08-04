"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useState, useTransition } from "react";

/**
 * A named-approver switch — a sibling of GrantCheckbox with the same
 * controlled/rollback behaviour, calling one action with a boolean
 * instead of two. Generic over which list it manages: the indents and
 * bills columns render this same component with their own action.
 */
export function ApproverCheckbox({
  userId,
  isApprover,
  action,
  label,
}: {
  userId: string;
  isApprover: boolean;
  /** A server action: (userId, canApprove) — setIndentApprover, setBillApprover. */
  action: (userId: string, canApprove: boolean) => Promise<{ error?: string } | undefined>;
  /** For the aria-label: "indent approver", "bill approver". */
  label: string;
}) {
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
        aria-label={`${checked ? "Remove" : "Make"} ${label}`}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          setError(undefined);
          startTransition(async () => {
            const result = await action(userId, next);
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
