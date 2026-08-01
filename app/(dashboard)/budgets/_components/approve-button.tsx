"use client";

import { Button } from "@/components/ui/button";
import { approveBudget, reopenBudget } from "@/lib/budgets/actions";
import { useState, useTransition } from "react";

/**
 * Approve is disabled until every line has a cost, using the live count
 * from the grid rather than what was on screen at page load — someone who
 * has just finished the last line shouldn't have to reload to approve it.
 *
 * The check is enforced again in the action against the database, because
 * a disabled button is a courtesy, not a rule.
 */
export function ApproveButton({
  budgetId,
  pendingCount,
  lineCount,
}: {
  budgetId: string;
  pendingCount: number;
  lineCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const blocked = lineCount === 0 || pendingCount > 0;

  return (
    <div className="space-y-1 text-right">
      <Button
        disabled={pending || blocked}
        title={blocked ? "Every line needs a cost first" : undefined}
        onClick={() =>
          startTransition(async () => {
            const result = await approveBudget(budgetId);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Approving…" : "Approve budget"}
      </Button>
      {blocked && lineCount > 0 && (
        <p className="text-muted text-xs">
          {pendingCount} {pendingCount === 1 ? "line" : "lines"} still to price
        </p>
      )}
      {error && <p className="text-danger text-xs font-medium">{error}</p>}
    </div>
  );
}

export function ReopenButton({ budgetId }: { budgetId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="space-y-1 text-right">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await reopenBudget(budgetId);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Re-opening…" : "Re-open for edits"}
      </Button>
      {error && <p className="text-danger text-xs font-medium">{error}</p>}
    </div>
  );
}
