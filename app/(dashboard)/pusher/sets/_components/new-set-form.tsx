"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/action-state";
import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

/** Name a new standard set. Its activities are added on its own card below. */
export function NewSetForm({
  action,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the field once the set exists, so adding three in a row does
  // not mean selecting and deleting the last name each time.
  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <Label htmlFor="set-name">New standard set</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="set-name"
          name="name"
          placeholder="e.g. Standard villa"
          className="max-w-xs flex-1"
          required
        />
        <Button type="submit" disabled={pending}>
          <Plus className="size-4" />
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormMessage error={state?.error} />
    </form>
  );
}
