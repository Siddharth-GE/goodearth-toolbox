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
  // Controlled, not defaultChecked: an uncontrolled box stays ticked after a failed write, claiming access nobody has.
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
          // Optimistic: the box moves at once and moves back if the server disagrees.
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
        <span role="alert" className="text-danger text-[10px] leading-tight font-medium">
          {error}
        </span>
      )}
    </div>
  );
}
