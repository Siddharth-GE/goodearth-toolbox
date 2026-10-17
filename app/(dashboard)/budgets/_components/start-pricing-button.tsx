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
        // One budget per revision is unique, so a double-click would hit the database twice; the action lands the loser on the winning budget.
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
