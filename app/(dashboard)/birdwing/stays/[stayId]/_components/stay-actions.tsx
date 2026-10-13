"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { markReviewed, moveStay } from "@/lib/birdwing/actions";
import type { StayStatus } from "@/lib/birdwing/shared";
import { isUndo, moveLabel, nextStatuses } from "@/lib/birdwing/workflow";
import { useState, useTransition } from "react";

/**
 * The moves a stay can make from where it is — the guard's list
 * (lib/birdwing/workflow.ts). Cancelling asks why and says the rooms are
 * let go; the undo moves are quiet buttons.
 */
export function StayActions({
  stayId,
  stayRef,
  status,
}: {
  stayId: string;
  stayRef: string;
  status: StayStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

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
              onClick={() => {
                setError(undefined);
                startTransition(async () => {
                  const result = await moveStay(stayId, to, null);
                  if (result?.error) setError(result.error);
                });
              }}
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

/** The import's doubts about this stay, and the press that clears them. */
export function ReviewedButton({ stayId }: { stayId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await markReviewed([stayId]);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Saving…" : "Mark reviewed"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
