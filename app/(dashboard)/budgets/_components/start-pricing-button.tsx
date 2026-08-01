"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { startPricing } from "@/lib/budgets/actions";
import { useState, useTransition } from "react";

export function StartPricingButton({ selectionId }: { selectionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        // One budget per revision is a unique constraint, so a double-click
        // would otherwise reach the database twice. The action handles the
        // race too, by landing the loser on the budget that won.
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startPricing(selectionId);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Starting…" : "Start pricing"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
