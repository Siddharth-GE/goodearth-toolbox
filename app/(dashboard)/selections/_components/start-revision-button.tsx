"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { startFirstRevision } from "@/lib/selections/actions";
import { useState, useTransition } from "react";

export function StartRevisionButton({ unitId }: { unitId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        // Disabled in flight: one draft per unit is a DB rule, so a double-click would surface as a duplicate-key error.
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startFirstRevision(unitId);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Starting…" : "Start R0"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
