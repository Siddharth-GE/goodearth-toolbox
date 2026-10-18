"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addUom, renameUom, setUomActive } from "@/lib/masters/uoms-actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useActionState, useEffect, useRef, useState } from "react";

export function UomForm() {
  const [state, formAction, pending] = useActionState(addUom, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="uom-name">Add a unit</Label>
          <Input id="uom-name" name="name" required autoComplete="off" placeholder="e.g. brass" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormMessage error={state?.error} />
    </form>
  );
}

/** A rename cascades to every row carrying the unit (0082). */
export function UomNameField({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState(name);
  const { pending, error, run } = useActionRunner();

  const save = async () => {
    const next = value.trim();
    if (!next || next === name) {
      setValue(name);
      return;
    }
    const result = await run(() => renameUom(id, next));
    if (result?.error) {
      setValue(name);
    }
  };

  return (
    <div className="space-y-1">
      <Input
        aria-label={`Rename unit ${name}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "Escape") setValue(name);
        }}
        disabled={pending}
        className="h-9 max-w-56 text-sm font-medium"
      />
      <FormMessage error={error} size="xs" />
    </div>
  );
}

export function UomToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const { pending, error, run } = useActionRunner();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setUomActive(id, !isActive))}
      >
        {pending ? "Saving…" : isActive ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}
