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
        // Disabled while in flight: the database enforces one draft per
        // unit, so a double-click would otherwise surface as a duplicate
        // key error rather than doing nothing.
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
