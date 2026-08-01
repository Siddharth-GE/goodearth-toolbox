"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { grantApp, revokeApp } from "@/lib/settings/actions";
import { useState, useTransition } from "react";

export function GrantCheckbox({
  userId,
  app,
  granted,
}: {
  userId: string;
  app: string;
  granted: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  // Controlled, not defaultChecked. An uncontrolled box keeps whatever
  // the click set it to even when the write failed, so the screen would
  // claim someone had access they didn't. This is the state the server
  // actually confirmed.
  const [checked, setChecked] = useState(granted);
  const [error, setError] = useState<string>();

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <Checkbox
        checked={checked}
        disabled={isPending}
        aria-label={`${checked ? "Revoke" : "Grant"} ${app}`}
        onChange={(event) => {
          const next = event.target.checked;
          // Optimistic: the box moves immediately, and moves back if the
          // server disagrees. Granting access should feel instant.
          setChecked(next);
          setError(undefined);
          startTransition(async () => {
            const result = next ? await grantApp(userId, app) : await revokeApp(userId, app);
            if (result?.error) {
              setChecked(!next);
              setError(result.error);
            }
          });
        }}
      />
      {error && (
        <span role="alert" className="text-[10px] font-medium leading-tight text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
