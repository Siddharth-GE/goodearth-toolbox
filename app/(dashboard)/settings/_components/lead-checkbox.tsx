"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { setToolLead } from "@/lib/settings/actions";
import { useState, useTransition } from "react";

/** The "Team lead" tick under a grant of a scoped tool (0122); controlled and rolled back like GrantCheckbox. */
export function LeadCheckbox({
  userId,
  app,
  isLead,
  toolName,
}: {
  userId: string;
  app: string;
  isLead: boolean;
  toolName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [checked, setChecked] = useState(isLead);
  const [error, setError] = useState<string>();

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <Checkbox
        checked={checked}
        disabled={isPending}
        aria-label={`${checked ? "Remove" : "Make"} team lead in ${toolName}`}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          setError(undefined);
          startTransition(async () => {
            const result = await setToolLead(userId, app, next);
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
