"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { createTransmittal } from "@/lib/design-management/actions";
import { useState, useTransition } from "react";

/**
 * Start a transmittal for this villa: one press, straight into the
 * workspace. The stage is guessed by the action (the villa's last one,
 * else the first on the list) and changed at the top of the workspace
 * if the guess is wrong — no pop-up asking first.
 */
export function NewTransmittalButton({
  unitId,
  hasStages,
}: {
  unitId: string;
  hasStages: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  // Nowhere to file it: say why rather than offering a press that can
  // only fail. Stages are a master, one click away in this same tool.
  if (!hasStages) {
    return (
      <Button variant="secondary" disabled>
        No design stages yet
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const result = await createTransmittal(unitId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Starting…" : "New transmittal"}
      </Button>
    </div>
  );
}
