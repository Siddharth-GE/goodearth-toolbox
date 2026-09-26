"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  deleteEstimate,
  startVillaEstimate,
  updateEstimate,
} from "@/lib/estimator/estimate-actions";
import type { EstimateDetail } from "@/lib/estimator/estimate-queries";
import { useState, useTransition } from "react";

/** An estimate's name and note — a villa or project change would be a
 * different estimate, not an edited one. */
export function EstimateFormDialog({
  estimate,
  trigger,
}: {
  estimate: EstimateDetail;
  trigger?: React.ReactNode;
}) {
  return (
    <RecordFormDialog
      label="Estimate"
      isEdit
      action={updateEstimate.bind(null, estimate.id)}
      trigger={trigger}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={estimate.name} required autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" defaultValue={estimate.note ?? ""} autoComplete="off" />
      </div>
    </RecordFormDialog>
  );
}

/** Something a villa's estimate can start from. */
export type StartSource = { id: string; label: string };

/**
 * Start a villa's working estimate (0098): blank, or from another
 * estimate. Every villa is different, so starting from another villa
 * brings its works as a head start and nothing else unless asked;
 * starting from this villa's own official estimate brings everything.
 */
export function StartVillaDialog({
  unitId,
  villaName,
  sources,
  preferredSourceId,
  trigger,
}: {
  unitId: string;
  villaName: string;
  /** Other estimates to start from — this villa's official first. */
  sources: StartSource[];
  /** Selected when the dialog opens: this villa's own official. */
  preferredSourceId?: string;
  trigger?: React.ReactNode;
}) {
  const [sourceId, setSourceId] = useState(preferredSourceId ?? "");
  const [everything, setEverything] = useState(!!preferredSourceId);

  return (
    <RecordFormDialog
      label="Estimate"
      isEdit={false}
      action={startVillaEstimate}
      trigger={trigger ?? <Button size="sm">Start</Button>}
      onOpen={() => {
        setSourceId(preferredSourceId ?? "");
        setEverything(!!preferredSourceId);
      }}
    >
      <input type="hidden" name="unit_id" value={unitId} />
      <p className="text-muted text-sm">
        {villaName}&apos;s estimate — the one you keep working on. When it is ready, Make official
        takes a numbered, frozen copy of it.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`source-${unitId}`}>Start from</Label>
        <Select
          id={`source-${unitId}`}
          name="source_estimate_id"
          value={sourceId}
          onChange={(event) => {
            setSourceId(event.target.value);
            setEverything(event.target.value !== "" && event.target.value === preferredSourceId);
          }}
        >
          <option value="">Nothing — add the works yourself</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </Select>
      </div>
      {sourceId && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            name="everything"
            checked={everything}
            onChange={(event) => setEverything(event.target.checked)}
          />
          <span>
            Copy everything — quantities, measurement sheets, and its own labour rates, materials
            and prices
            <span className="text-muted block text-xs">
              Unticked, only the list of works comes across, each one to measure for this villa.
            </span>
          </span>
        </label>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`name-${unitId}`}>Name (optional)</Label>
        <Input id={`name-${unitId}`} name="name" autoComplete="off" placeholder={villaName} />
      </div>
    </RecordFormDialog>
  );
}

/** Delete a draft — behind a confirm, since it takes its measurement
 * sheets and this villa's own rates with it. */
export function DeleteEstimateButton({
  estimateId,
  label = "Delete",
  description,
}: {
  estimateId: string;
  label?: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label} this estimate?</DialogTitle>
        </DialogHeader>
        <p className="text-muted text-sm">{description}</p>
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Keep it</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteEstimate(estimateId);
                setError(result?.error);
              })
            }
          >
            {pending ? "Deleting…" : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
