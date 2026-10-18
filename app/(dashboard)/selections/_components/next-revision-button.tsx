"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { createNextRevision } from "@/lib/selections/actions";
import { ArrowRight } from "lucide-react";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

export function NextRevisionButton({ fromSelectionId }: { fromSelectionId: string }) {
  const { pending, error, run } = useActionRunner();

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        // The database refuses a second open draft; block the button in flight so a double-click doesn't surface that as an error.
        disabled={pending}
        onClick={() => run(() => createNextRevision(fromSelectionId))}
      >
        {pending ? "Creating…" : "Start next revision"}
        {!pending && <ArrowRight className="size-4" />}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
