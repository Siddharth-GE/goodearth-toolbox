"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { startFirstRevision } from "@/lib/selections/actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

export function StartRevisionButton({ unitId }: { unitId: string }) {
  const { pending, error, run } = useActionRunner();

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        // Disabled in flight: one draft per unit is a DB rule, so a double-click would surface as a duplicate-key error.
        disabled={pending}
        onClick={() => run(() => startFirstRevision(unitId))}
      >
        {pending ? "Starting…" : "Start R0"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
