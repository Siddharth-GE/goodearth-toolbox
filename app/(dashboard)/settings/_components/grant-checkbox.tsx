"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { grantApp, revokeApp } from "@/lib/settings/actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

export function GrantCheckbox({
  userId,
  app,
  granted,
}: {
  userId: string;
  app: string;
  granted: boolean;
}) {
  const { pending: isPending, error, run } = useActionRunner();
  // Controlled, not defaultChecked: an uncontrolled box stays ticked after a failed write, claiming access nobody has.
  const [checked, setChecked] = useState(granted);

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <Checkbox
        checked={checked}
        disabled={isPending}
        aria-label={`${checked ? "Revoke" : "Grant"} ${app}`}
        onChange={async (event) => {
          const next = event.target.checked;
          // Optimistic: the box moves at once and moves back if the server disagrees.
          setChecked(next);

          const result = await run(() => (next ? grantApp(userId, app) : revokeApp(userId, app)));
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
