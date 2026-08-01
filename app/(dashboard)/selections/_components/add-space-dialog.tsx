"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addSpaces } from "@/lib/selections/actions";
import { Minus, Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

type SpaceType = { id: string; code: string; name: string };
type ExistingSpace = { label: string; space_type_id: string };

/**
 * Sets up several spaces at once.
 *
 * A villa is eight or nine spaces, and adding them one dialog at a time
 * was the slowest part of starting a design. Same stepper idea as the
 * catalogue picker: build the list locally, review it, write it in one go.
 */
export function AddSpaceDialog({
  unitId,
  spaceTypes,
  existing,
  trigger,
}: {
  unitId: string;
  spaceTypes: SpaceType[];
  existing: ExistingSpace[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Labels the designer has overridden, keyed by their position in the
  // generated list. Anything untouched keeps following the suggestion.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  /**
   * Suggested names. One of a type is just "Kitchen"; several become
   * "Bedroom 1", "Bedroom 2". Numbering continues past whatever the unit
   * already has, and skips any name that's taken.
   */
  const planned = useMemo(() => {
    const taken = new Set(existing.map((space) => space.label.toLowerCase()));
    const rows: { key: string; spaceTypeId: string; suggestion: string }[] = [];

    for (const type of spaceTypes) {
      const count = counts[type.id] ?? 0;
      if (count === 0) continue;
      const alreadyOfType = existing.filter((space) => space.space_type_id === type.id).length;
      let n = alreadyOfType;

      for (let i = 0; i < count; i++) {
        let suggestion: string;
        if (alreadyOfType === 0 && count === 1) {
          suggestion = type.name;
        } else {
          do {
            n += 1;
            suggestion = `${type.name} ${n}`;
          } while (taken.has(suggestion.toLowerCase()));
        }
        // Guard the un-numbered case too, in case another type used it.
        while (taken.has(suggestion.toLowerCase())) suggestion = `${suggestion} +`;
        taken.add(suggestion.toLowerCase());
        rows.push({ key: `${type.id}:${i}`, spaceTypeId: type.id, suggestion });
      }
    }
    return rows;
  }, [counts, existing, spaceTypes]);

  const total = planned.length;

  const step = (typeId: string, by: number) =>
    setCounts((current) => {
      const next = { ...current };
      const value = (next[typeId] ?? 0) + by;
      if (value <= 0) delete next[typeId];
      else next[typeId] = value;
      return next;
    });

  const reset = () => {
    setCounts({});
    setOverrides({});
    setError(undefined);
  };

  const commit = () =>
    startSaving(async () => {
      const outcome = await addSpaces(
        unitId,
        planned.map((row) => ({
          spaceTypeId: row.spaceTypeId,
          label: overrides[row.key]?.trim() || row.suggestion,
        })),
      );
      if (outcome?.error) {
        setError(outcome.error);
        return;
      }
      reset();
      setOpen(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {/* asChild so the caller's own button keeps its focus and keyboard
          behaviour rather than being wrapped in a non-focusable element. */}
      <DialogTrigger asChild>
        {trigger ?? <Button variant="secondary">Add spaces</Button>}
      </DialogTrigger>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-4">
        <DialogHeader className="mb-0">
          <DialogTitle>Add spaces</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div>
            <p className="text-muted mb-2 text-xs font-semibold tracking-widest uppercase">
              How many of each
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {spaceTypes.map((type) => {
                const count = counts[type.id] ?? 0;
                return (
                  <div
                    key={type.id}
                    className={[
                      "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors",
                      count > 0 ? "border-accent" : "border-border",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => step(type.id, 1)}
                      className="min-w-0 flex-1 text-left focus-visible:outline-none"
                      aria-label={`Add one ${type.name}`}
                    >
                      <span className="text-foreground block truncate text-sm">{type.name}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton
                        aria-label={`Remove one ${type.name}`}
                        size="sm"
                        bordered
                        disabled={count === 0}
                        onClick={() => step(type.id, -1)}
                      >
                        <Minus className="size-3.5" />
                      </IconButton>
                      <span
                        className={[
                          "min-w-5 text-center text-sm font-semibold tabular-nums",
                          count > 0 ? "text-foreground" : "text-muted/40",
                        ].join(" ")}
                      >
                        {count}
                      </span>
                      <IconButton
                        aria-label={`Add one ${type.name}`}
                        size="sm"
                        bordered
                        onClick={() => step(type.id, 1)}
                      >
                        <Plus className="size-3.5" />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {total > 0 && (
            <div>
              <p className="text-muted mb-2 text-xs font-semibold tracking-widest uppercase">
                Names — edit any of these
              </p>
              <div className="space-y-2">
                {planned.map((row) => (
                  <Input
                    key={row.key}
                    value={overrides[row.key] ?? row.suggestion}
                    onChange={(event) =>
                      setOverrides((current) => ({ ...current, [row.key]: event.target.value }))
                    }
                    className="h-10"
                    aria-label={`Name for ${row.suggestion}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="min-w-0">
            <p className="text-muted text-sm">
              {total === 0
                ? "Pick the rooms this unit has."
                : `${total} ${total === 1 ? "space" : "spaces"}`}
            </p>
            <FormMessage error={error} size="xs" />
          </div>
          <div className="flex items-center gap-2">
            {total > 0 && (
              <Button variant="ghost" onClick={reset} disabled={saving}>
                Clear
              </Button>
            )}
            <Button onClick={commit} disabled={saving || total === 0}>
              {saving ? "Adding…" : `Add ${total || ""}`.trim()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
