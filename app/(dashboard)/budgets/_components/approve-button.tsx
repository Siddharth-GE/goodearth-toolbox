"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { approveBudget, reopenBudget } from "@/lib/budgets/actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

/**
 * Disabled until every line has a cost, from the grid's live count.
 * The action re-checks against the database: a disabled button is a courtesy, not a rule.
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
  const { pending, error, run } = useActionRunner();

  const blocked = lineCount === 0 || pendingCount > 0;

  return (
    <div className="space-y-1 text-right">
      <Button
        disabled={pending || blocked}
        title={blocked ? "Every line needs a cost first" : undefined}
        onClick={() => run(() => approveBudget(budgetId))}
      >
        {pending ? "Approving…" : "Approve budget"}
      </Button>
      {blocked && lineCount > 0 && (
        <p className="text-muted text-xs">
          {pendingCount} {pendingCount === 1 ? "line" : "lines"} still to price
        </p>
      )}
      <FormMessage error={error} size="xs" />
    </div>
  );
}

export function ReopenButton({ budgetId }: { budgetId: string }) {
  const { pending, error, run } = useActionRunner();

  return (
    <div className="space-y-1 text-right">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => reopenBudget(budgetId))}
      >
        {pending ? "Re-opening…" : "Re-open for edits"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
