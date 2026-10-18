"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { markReviewed, moveStay } from "@/lib/birdwing/actions";
import type { StayStatus } from "@/lib/birdwing/shared";
import { isUndo, moveLabel, nextStatuses } from "@/lib/birdwing/workflow";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

export function StayActions({
  stayId,
  stayRef,
  status,
}: {
  stayId: string;
  stayRef: string;
  status: StayStatus;
}) {
  const { pending, error, run } = useActionRunner();

  const moves = nextStatuses(status);
  if (moves.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {moves.map((to) =>
          to === "cancelled" ? (
            <ConfirmDialog
              key={to}
              trigger={
                <Button variant="ghost" size="sm" className="text-danger">
                  {moveLabel(status, to)}
                </Button>
              }
              title={status === "blocked" ? `Remove block ${stayRef}?` : `Cancel ${stayRef}?`}
              description={
                status === "blocked"
                  ? "The rooms become free for those nights."
                  : "Its rooms are let go at once and can be booked by someone else. Charges and money already recorded stay on it. A cancelled stay can't be brought back."
              }
              confirmLabel={status === "blocked" ? "Remove block" : "Cancel the stay"}
              pendingLabel="Cancelling…"
              reason={{ label: "Why", placeholder: "e.g. Guest called off the trip" }}
              onConfirm={(why) => moveStay(stayId, to, why)}
            />
          ) : (
            <Button
              key={to}
              size="sm"
              variant={isUndo(status, to) ? "ghost" : "primary"}
              disabled={pending}
              onClick={() => run(() => moveStay(stayId, to, null))}
            >
              {moveLabel(status, to)}
            </Button>
          ),
        )}
      </div>
      <FormMessage error={error} size="xs" />
    </div>
  );
}

export function ReviewedButton({ stayId }: { stayId: string }) {
  const { pending, error, run } = useActionRunner();
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => markReviewed([stayId]))}
      >
        {pending ? "Saving…" : "Mark reviewed"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
