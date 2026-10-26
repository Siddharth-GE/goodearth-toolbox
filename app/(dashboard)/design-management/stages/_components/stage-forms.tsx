"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TableRow } from "@/components/ui/table";
import {
  addDesignStage,
  moveDesignStage,
  reorderDesignStages,
  renameDesignStage,
  setDesignStageActive,
  setDesignStageCode,
  setDesignStageOnBoard,
} from "@/lib/design-management/stage-actions";
import { dropStage } from "@/lib/design-management/stage-order";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

export function DesignStageForm({ stages }: { stages: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(addDesignStage, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="stage-name">Add a stage</Label>
          <Input id="stage-name" name="name" required autoComplete="off" placeholder="e.g. MEP" />
        </div>
        {stages.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="stage-after">Place it</Label>
            <Select id="stage-after" name="after" defaultValue="end">
              <option value="end">At the end</option>
              <option value="start">At the start</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  After {stage.name}
                </option>
              ))}
            </Select>
          </div>
        )}
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

/**
 * The stage rows, dragged by their handle into a new order on a computer (a phone keeps the arrows). The new order
 * shows at once and saves as one list; a refusal puts it back and says why.
 */
export function DesignStageRows({
  rows,
}: {
  rows: { id: string; name: string; cells: ReactNode }[];
}) {
  const { pending, error, run } = useActionRunner();
  const serverIds = rows.map((row) => row.id).join(",");
  const [order, setOrder] = useState<string[] | null>(null);
  const [seen, setSeen] = useState(serverIds);
  if (seen !== serverIds) {
    setSeen(serverIds);
    setOrder(null);
  }
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const ids = order ?? rows.map((row) => row.id);
  const byId = new Map(rows.map((row) => [row.id, row]));

  const drop = (onto: string) => {
    const from = dragging;
    setDragging(null);
    setOver(null);
    if (!from || from === onto) return;
    const next = dropStage(ids, from, onto);
    setOrder(next);
    void run(async () => {
      const result = await reorderDesignStages(next);
      if (result?.error) setOrder(null);
      return result;
    });
  };

  return (
    <>
      {error ? (
        <tr>
          <td colSpan={6} className="px-3 py-2">
            <FormMessage error={error} size="xs" />
          </td>
        </tr>
      ) : null}
      {ids.map((id) => {
        const row = byId.get(id);
        if (!row) return null;
        return (
          <TableRow
            key={id}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              setOver(id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop(id);
            }}
            className={cn(
              dragging === id && "opacity-50",
              over === id && dragging !== id && "bg-accent/10",
            )}
          >
            <td className="w-8 pl-2 max-sm:hidden">
              <span
                draggable={!pending}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", row.name);
                  setDragging(id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                aria-hidden
                title={`Drag ${row.name} to a new place`}
                className="text-muted hover:text-foreground grid size-7 cursor-grab place-items-center active:cursor-grabbing"
              >
                <GripVertical className="size-4" />
              </span>
            </td>
            {row.cells}
          </TableRow>
        );
      })}
    </>
  );
}
