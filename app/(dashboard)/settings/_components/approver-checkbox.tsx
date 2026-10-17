"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useState, useTransition } from "react";

/** Sibling of GrantCheckbox calling one action with a boolean; the indents and bills columns share it. */
export function ApproverCheckbox({
  userId,
  isApprover,
  action,
  label,
}: {
  userId: string;
  isApprover: boolean;
  action: (userId: string, canApprove: boolean) => Promise<{ error?: string } | undefined>;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();
  // Controlled: the state the server confirmed, rolled back if the write fails.
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
