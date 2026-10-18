"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/action-state";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useActionState, useEffect, useRef, useState } from "react";

export function StageForm({
  action,
  inputId,
  placeholder,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  inputId: string;
  placeholder: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
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
          <Label htmlFor={inputId}>Add a stage</Label>
          <Input id={inputId} name="name" required autoComplete="off" placeholder={placeholder} />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormMessage error={state?.error} />
    </form>
  );
}

export function StageNameField({
  id,
  name,
  rename,
}: {
  id: string;
  name: string;
  rename: (id: string, name: string) => Promise<ActionState>;
}) {
  const [value, setValue] = useState(name);
  const { pending, error, run } = useActionRunner();

  const save = async () => {
    const next = value.trim();
    if (!next || next === name) {
      setValue(name);
      return;
    }
    const result = await run(() => rename(id, next));
    if (result?.error) {
      setValue(name);
    }
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

export function StageToggle({
  id,
  isActive,
  setActive,
}: {
  id: string;
  isActive: boolean;
  setActive: (id: string, isActive: boolean) => Promise<ActionState>;
}) {
  const { pending, error, run } = useActionRunner();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setActive(id, !isActive))}
      >
        {pending ? "Saving…" : isActive ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}

export function StageMove({
  id,
  name,
  first,
  last,
  move,
}: {
  id: string;
  name: string;
  first: boolean;
  last: boolean;
  move: (id: string, direction: "up" | "down") => Promise<ActionState>;
}) {
  const { pending, error, run } = useActionRunner();
  const go = (direction: "up" | "down") => run(() => move(id, direction));

  return (
    <div className="flex items-center gap-1">
      <IconButton
        aria-label={`Move ${name} up`}
        size="sm"
        bordered
        disabled={pending || first}
        onClick={() => go("up")}
      >
        <ChevronUp className="size-4" />
      </IconButton>
      <IconButton
        aria-label={`Move ${name} down`}
        size="sm"
        bordered
        disabled={pending || last}
        onClick={() => go("down")}
      >
        <ChevronDown className="size-4" />
      </IconButton>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
