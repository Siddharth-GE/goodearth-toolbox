"use client";

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
import { Select } from "@/components/ui/select";
import { startTransmittal } from "@/lib/design-management/actions";
import type { VillaDrawingSetState } from "@/lib/design-management/queries";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import Link from "next/link";
import { useState } from "react";

/** A stage, then one drawing set of THAT stage: only this villa's sets at the chosen stage are offered (0099 refuses a mismatch too). */
export function NewTransmittalDialog({
  unitId,
  stages,
  sets,
  defaultStageId,
}: {
  unitId: string;
  stages: { id: string; name: string }[];
  sets: VillaDrawingSetState[];
  defaultStageId: string | null;
}) {
  const initialStage =
    stages.find((stage) => stage.id === defaultStageId)?.id ?? stages[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [stageId, setStageId] = useState(initialStage);
  const [name, setName] = useState("");
  const { pending, error, run, clearError } = useActionRunner();

  if (stages.length === 0) {
    return (
      <Button variant="secondary" disabled>
        No design stages yet
      </Button>
    );
  }

  const stageName = stages.find((stage) => stage.id === stageId)?.name ?? "";
  const stageSets = sets.filter((set) => set.stageId === stageId);

  // Success redirects to the new transmittal; only a refusal returns.
  const start = (choice: { setId: string } | { newSetName: string }) =>
    run(() => startTransmittal(unitId, stageId, choice));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) clearError();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">New transmittal</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New transmittal</DialogTitle>
          <DialogDescription>
            One transmittal sends one drawing set of one stage to site, as the WorkDrive link to its
            sheets.
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={pending} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="new-transmittal-stage">Stage</Label>
            <Select
              id="new-transmittal-stage"
              value={stageId}
              onChange={(event) => {
                setStageId(event.target.value);
                clearError();
              }}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </div>

          {stageSets.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
                {stageName} sets on this villa
              </p>
              <ul className="divide-border max-h-[40dvh] divide-y overflow-y-auto">
                {stageSets.map((set) => (
                  <li
                    key={set.setId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-foreground text-sm font-medium">{set.setName}</p>
                      <p className="text-muted text-xs">{stateLine(set)}</p>
                    </div>
                    <SetOffer
                      set={set}
                      onStart={() => start({ setId: set.setId })}
                      onOpenElsewhere={() => setOpen(false)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              start({ newSetName: name });
            }}
            className="space-y-1.5"
          >
            <Label htmlFor="new-set-name">
              {stageSets.length > 0 ? `Or start a new ${stageName} set` : `New ${stageName} set`}
            </Label>
            <div className="flex gap-2">
              <Input
                id="new-set-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
                autoComplete="off"
                placeholder="e.g. Ground floor plans"
              />
              <Button type="submit" className="h-11 shrink-0" disabled={!name.trim()}>
                Start
              </Button>
            </div>
          </form>
        </fieldset>

        <FormMessage error={error} className="mt-3" />
        {pending && <p className="text-muted mt-3 text-xs">Starting…</p>}
      </DialogContent>
    </Dialog>
  );
}

function SetOffer({
  set,
  onStart,
  onOpenElsewhere,
}: {
  set: VillaDrawingSetState;
  onStart: () => void;
  onOpenElsewhere: () => void;
}) {
  if (set.draft?.transmittalId) {
    return (
      <Link
        href={`/design-management/transmittals/${set.draft.transmittalId}`}
        onClick={onOpenElsewhere}
        className="text-accent text-xs font-medium hover:underline"
      >
        R{set.draft.revisionNo} is being prepared — open it
      </Link>
    );
  }
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onStart}>
      {set.draft ? `Continue R${set.draft.revisionNo}` : `Revise to R${set.nextRevisionNo}`}
    </Button>
  );
}

function stateLine(set: VillaDrawingSetState): string {
  if (set.released) {
    const sheets = `${set.released.fileCount} ${set.released.fileCount === 1 ? "sheet" : "sheets"}`;
    return set.draft
      ? `Released R${set.released.revisionNo} · R${set.draft.revisionNo} in draft`
      : `Released R${set.released.revisionNo} · ${sheets}`;
  }
  if (set.draft) return `R${set.draft.revisionNo} in draft · not sent yet`;
  return "Not sent yet";
}
