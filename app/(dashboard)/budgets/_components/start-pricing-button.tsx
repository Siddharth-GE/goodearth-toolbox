"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { startPricing } from "@/lib/budgets/actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

export function StartPricingButton({ selectionId }: { selectionId: string }) {
  const { pending, error, run } = useActionRunner();

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        // One budget per revision is unique, so a double-click would hit the database twice; the action lands the loser on the winning budget.
        disabled={pending}
        onClick={() => run(() => startPricing(selectionId))}
      >
        {pending ? "Starting…" : "Start pricing"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
