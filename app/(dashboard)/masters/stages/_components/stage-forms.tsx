"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addConstructionStage,
  renameConstructionStage,
  setConstructionStageActive,
} from "@/lib/masters/stages-actions";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

export function StageForm() {
  const [state, formAction, pending] = useActionState(addConstructionStage, undefined);
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
          <Label htmlFor="stage-name">Add a stage</Label>
          <Input
            id="stage-name"
            name="name"
            required
            autoComplete="off"
            placeholder="e.g. Waterproofing"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormMessage error={state?.error} />
    </form>
  );
}

/** The name, editable in place. A rename follows through to every
 * indent and budget line carrying it, so the input says so. */
export function StageNameField({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const save = () => {
    const next = value.trim();
    if (!next || next === name) {
      setValue(name);
      return;
    }
    startTransition(async () => {
      const result = await renameConstructionStage(id, next);
      if (result?.error) {
        setError(result.error);
        setValue(name);
      } else {
        setError(undefined);
      }
    });
  };

  return (
    <div className="space-y-1">
      <Input
        aria-label={`Rename stage ${name}`}
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

export function StageToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setConstructionStageActive(id, !isActive);
            setError(result?.error);
          })
        }
      >
        {pending ? "Saving…" : isActive ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}
