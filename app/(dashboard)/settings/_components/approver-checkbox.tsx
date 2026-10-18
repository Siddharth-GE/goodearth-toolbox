"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

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
  const { pending: isPending, error, run } = useActionRunner();
  // Controlled: the state the server confirmed, rolled back if the write fails.
  const [checked, setChecked] = useState(isApprover);

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <Checkbox
        checked={checked}
        disabled={isPending}
        aria-label={`${checked ? "Remove" : "Make"} ${label}`}
        onChange={async (event) => {
          const next = event.target.checked;
          setChecked(next);

          const result = await run(() => action(userId, next));
          if (result?.error) {
            setChecked(!next);
          }
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
