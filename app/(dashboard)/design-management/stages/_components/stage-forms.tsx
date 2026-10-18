"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addDesignStage,
  moveDesignStage,
  renameDesignStage,
  setDesignStageActive,
  setDesignStageCode,
  setDesignStageOnBoard,
} from "@/lib/design-management/stage-actions";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useActionState, useEffect, useRef, useState } from "react";

export function DesignStageForm() {
  const [state, formAction, pending] = useActionState(addDesignStage, undefined);
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
          <Input id="stage-name" name="name" required autoComplete="off" placeholder="e.g. MEP" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormMessage error={state?.error} />
    </form>
  );
}

/** A rename follows through to every transmittal carrying it, so no confirmation. */
export function DesignStageNameField({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState(name);
  const { pending, error, run } = useActionRunner();

  const save = async () => {
    const next = value.trim();
    if (!next || next === name) {
      setValue(name);
      return;
    }
    const result = await run(() => renameDesignStage(id, next));
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

/** The stage's short code in every sheet's file name; a change renames those sheets on their next download. */
export function DesignStageCodeField({ id, code }: { id: string; code: string | null }) {
  const [value, setValue] = useState(code ?? "");
  const { pending, error, run } = useActionRunner();

  const save = async () => {
    const next = value.trim().toUpperCase();
    if (next === (code ?? "")) {
      setValue(code ?? "");
      return;
    }
    const result = await run(() => setDesignStageCode(id, next));
    if (result?.error) {
      setValue(code ?? "");
    }
  };

  return (
    <div className="space-y-1">
      <Input
        aria-label="Stage code for sheet file names"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "Escape") setValue(code ?? "");
        }}
        disabled={pending}
        maxLength={6}
        placeholder="WD"
        className="h-9 w-20 font-mono text-sm uppercase"
      />
      <FormMessage error={error} size="xs" />
    </div>
  );
}

export function DesignStageToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const { pending, error, run } = useActionRunner();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setDesignStageActive(id, !isActive))}
      >
        {pending ? "Saving…" : isActive ? "Retire" : "Reactivate"}
      </Button>
    </div>
  );
}

export function DesignStageBoardSwitch({
  id,
  name,
  onBoard,
  disabled,
}: {
  id: string;
  name: string;
  onBoard: boolean;
  disabled?: boolean;
}) {
  const { pending, error, run } = useActionRunner();

  return (
    <div className="flex flex-col gap-1">
      <label className="text-foreground inline-flex items-center gap-2 text-sm whitespace-nowrap">
        <Checkbox
          checked={onBoard}
          disabled={pending || disabled}
          aria-label={`${name} on the design board`}
          onChange={(event) => {
            const next = event.currentTarget.checked;
            run(() => setDesignStageOnBoard(id, next));
          }}
        />
        {pending ? "Saving…" : onBoard ? "On the board" : "Off"}
      </label>
      <FormMessage error={error} size="xs" />
    </div>
  );
}

export function DesignStageMoveButtons({
  id,
  name,
  isFirst,
  isLast,
}: {
  id: string;
  name: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { pending, error, run } = useActionRunner();

  const move = (direction: "up" | "down") => run(() => moveDesignStage(id, direction));

  return (
    <>
      <FormMessage error={error} size="xs" />
      <IconButton
        aria-label={`Move ${name} up`}
        disabled={pending || isFirst}
        onClick={() => move("up")}
      >
        <ArrowUp className="size-4" />
      </IconButton>
      <IconButton
        aria-label={`Move ${name} down`}
        disabled={pending || isLast}
        onClick={() => move("down")}
      >
        <ArrowDown className="size-4" />
      </IconButton>
    </>
  );
}
