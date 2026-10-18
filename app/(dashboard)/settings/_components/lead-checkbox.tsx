"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { setToolLead } from "@/lib/settings/actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

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
  const { pending: isPending, error, run } = useActionRunner();
  const [checked, setChecked] = useState(isLead);

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <Checkbox
        checked={checked}
        disabled={isPending}
        aria-label={`${checked ? "Remove" : "Make"} team lead in ${toolName}`}
        onChange={async (event) => {
          const next = event.target.checked;
          setChecked(next);

          const result = await run(() => setToolLead(userId, app, next));
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
