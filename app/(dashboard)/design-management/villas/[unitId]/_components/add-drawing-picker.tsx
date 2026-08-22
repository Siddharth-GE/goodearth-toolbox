"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { createDraftRevision } from "@/lib/design-management/actions";
import { useState, useTransition } from "react";

/**
 * Active sets with no revision on this villa yet — starting one here
 * creates its R0 draft, the same createDraftRevision action a set's own
 * "Start next revision" button uses.
 */
export function AddDrawingPicker({
  unitId,
  sets,
}: {
  unitId: string;
  sets: { id: string; code: string | null; name: string }[];
}) {
  const [pendingId, setPendingId] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  if (sets.length === 0) return null;

  const start = (setId: string) => {
    setError(undefined);
    setPendingId(setId);
    startTransition(async () => {
      const result = await createDraftRevision(unitId, setId);
      if (result?.error) setError(result.error);
      setPendingId(undefined);
    });
  };

  return (
    <Card className="space-y-2 p-4">
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">Add a drawing</p>
      <FormMessage error={error} size="xs" />
      <div className="flex flex-wrap gap-2">
        {sets.map((set) => (
          <Button
            key={set.id}
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending && pendingId === set.id}
            onClick={() => start(set.id)}
          >
            {pending && pendingId === set.id
              ? "Starting…"
              : set.code
                ? `${set.code} — ${set.name}`
                : set.name}
          </Button>
        ))}
      </div>
    </Card>
  );
}
