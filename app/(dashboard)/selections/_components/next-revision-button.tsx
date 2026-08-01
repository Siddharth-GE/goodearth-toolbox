"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { createNextRevision } from "@/lib/selections/actions";
import { ArrowRight } from "lucide-react";
import { useState, useTransition } from "react";

export function NextRevisionButton({ fromSelectionId }: { fromSelectionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        // The database refuses a second open draft, so blocking the button
        // while in flight keeps a double-click from surfacing that as an
        // error the designer has to interpret.
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await createNextRevision(fromSelectionId);
            if (outcome?.error) setError(outcome.error);
          })
        }
      >
        {pending ? "Creating…" : "Start next revision"}
        {!pending && <ArrowRight className="size-4" />}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
