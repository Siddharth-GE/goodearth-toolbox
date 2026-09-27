"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addTransmittalLine,
  createRevisionOnTransmittal,
  createSetOnTransmittal,
} from "@/lib/design-management/actions";
import type { VillaDrawingSetState } from "@/lib/design-management/queries";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

/**
 * The one way a drawing goes onto a draft transmittal (2026-09-27 audit:
 * three stacked forms — a board, a name box and a re-send picker — each
 * with its own button, at the bottom of the page).
 *
 * One dialog, two parts: name a new set, or pick one of THIS villa's
 * sets, each offering only the press that makes sense for where it
 * stands. Every offer is an existing action; the dialog closes when one
 * succeeds and keeps its error inside when one doesn't.
 */
export function AddDrawingDialog({
  transmittalId,
  sets,
  setIdsOnTransmittal,
  variant = "secondary",
}: {
  transmittalId: string;
  sets: VillaDrawingSetState[];
  setIdsOnTransmittal: string[];
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [name, setName] = useState("");

  const onTransmittal = new Set(setIdsOnTransmittal);

  // Every press goes through here: one pending state for the whole
  // dialog, so two offers can't race, and close only on success.
  const run = (action: () => Promise<{ error?: string } | undefined>) => {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        setError(result.error);
        return;
      }
      setName("");
      setOpen(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size="sm">
          <Plus className="size-4" />
          Add drawing
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a drawing</DialogTitle>
          <DialogDescription>
            Start a new drawing set, or revise one this villa already has.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createSetOnTransmittal(transmittalId, name));
          }}
        >
          <fieldset disabled={pending} className="space-y-1.5">
            <Label htmlFor="new-set-name">New drawing set</Label>
            <div className="flex gap-2">
              <Input
                id="new-set-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
                autoComplete="off"
                placeholder="e.g. Working Drawings — Ground Floor"
              />
              <Button type="submit" className="h-11 shrink-0" disabled={!name.trim()}>
                Add
              </Button>
            </div>
          </fieldset>
        </form>

        {sets.length > 0 && (
          <div className="mt-5 space-y-1.5">
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
              This villa&apos;s sets
            </p>
            <ul className="divide-border max-h-[45dvh] divide-y overflow-y-auto">
              {sets.map((set) => (
                <li
                  key={set.setId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-foreground text-sm font-medium">{setLabel(set)}</p>
                    <p className="text-muted text-xs">{stateLine(set)}</p>
                  </div>
                  <SetOffer
                    set={set}
                    transmittalId={transmittalId}
                    onThis={onTransmittal.has(set.setId)}
                    pending={pending}
                    onClose={() => setOpen(false)}
                    run={run}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <FormMessage error={error} className="mt-3" />
        {pending && <p className="text-muted mt-3 text-xs">Adding…</p>}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The one right press for a set, given where it stands on this villa.
 * `createRevisionOnTransmittal` re-reads the villa's state itself, so the
 * label is the only thing that differs and the screen can never disagree
 * with the database about which case it is in.
 */
function SetOffer({
  set,
  transmittalId,
  onThis,
  pending,
  onClose,
  run,
}: {
  set: VillaDrawingSetState;
  transmittalId: string;
  onThis: boolean;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<{ error?: string } | undefined>) => void;
}) {
  if (onThis) return <Badge variant="info">On this transmittal</Badge>;

  // A draft open on ANOTHER transmittal: the database allows one draft
  // per set per villa, so the honest offer is to go to it.
  if (set.draft?.transmittalId && set.draft.transmittalId !== transmittalId) {
    return (
      <Link
        href={`/design-management/transmittals/${set.draft.transmittalId}`}
        onClick={onClose}
        className="text-accent text-xs font-medium hover:underline"
      >
        Draft R{set.draft.revisionNo} is on another transmittal — open it
      </Link>
    );
  }

  const revise = () => run(() => createRevisionOnTransmittal(transmittalId, set.setId));

  // A draft on no transmittal at all — left over from before a draft was
  // deleted with its line. Picking it up is the only way to reach it.
  if (set.draft) {
    return (
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={revise}>
        Continue draft R{set.draft.revisionNo}
      </Button>
    );
  }

  const released = set.released;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {released && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => addTransmittalLine(transmittalId, released.revisionId))}
          title="Put the released drawing on this transmittal exactly as it is"
        >
          Send R{released.revisionNo} again
        </Button>
      )}
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={revise}>
        Revise to R{set.nextRevisionNo}
      </Button>
    </div>
  );
}

function setLabel(set: VillaDrawingSetState): string {
  return set.setCode ? `${set.setCode} — ${set.setName}` : set.setName;
}

/** What this villa has of the set, said plainly. */
function stateLine(set: VillaDrawingSetState): string {
  const parts: string[] = [];
  if (set.draft) parts.push(`Draft R${set.draft.revisionNo} · ${fileCount(set.draft.fileCount)}`);
  if (set.released) {
    parts.push(
      set.draft
        ? `last released R${set.released.revisionNo}`
        : `Released R${set.released.revisionNo} · ${fileCount(set.released.fileCount)}`,
    );
  }
  return parts.length === 0 ? "Not drawn for this villa yet" : parts.join(" · ");
}

function fileCount(count: number): string {
  return `${count} ${count === 1 ? "sheet" : "sheets"}`;
}
