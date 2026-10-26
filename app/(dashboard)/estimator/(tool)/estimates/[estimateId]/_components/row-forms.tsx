"use client";

import { Button } from "@/components/ui/button";
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
import { duplicateEstimateLine, setEstimateLineLabel } from "@/lib/estimator/estimate-actions";
import { saveWorkInfo } from "@/lib/estimator/works-actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";
import { UomSelect } from "../../../_components/uom-select";

/** A second row of this work, carrying everything, to change only what differs: another window size, another mix. */
export function DuplicateLineButton({ id, label }: { id: string; label: string }) {
  const { pending, error, run } = useActionRunner();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Duplicate ${label}`}
        disabled={pending}
        onClick={() => run(() => duplicateEstimateLine(id))}
      >
        {pending ? "Copying…" : "Duplicate"}
      </Button>
    </div>
  );
}

/** The row's own name, saved when the box is left: what tells it from another row of the same work. */
export function LineLabelField({ id, label }: { id: string; label: string | null }) {
  const [value, setValue] = useState(label ?? "");
  const { pending, error, run } = useActionRunner();

  const save = async () => {
    if (value.trim() === (label ?? "")) return;
    const result = await run(() => setEstimateLineLabel(id, value));
    if (result?.error) setValue(label ?? "");
  };

  return (
    <div className="mt-1 space-y-1">
      <Input
        aria-label="Name this row"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        placeholder="Name this row — W1 1.2 × 1.5"
        maxLength={120}
        disabled={pending}
        className="h-8 max-w-xs text-xs"
      />
      <FormMessage error={error} size="xs" />
    </div>
  );
}

/** A work the rate book has not set up is given its unit, and its labour rate if known, from the estimate: saved for
 * the work, so every estimate measures it the same way. Its materials or mix are then this row's own. */
export function SetUpWorkDialog({
  workItemId,
  workName,
  uoms,
}: {
  workItemId: string;
  workName: string;
  uoms: string[];
}) {
  const [open, setOpen] = useState(false);
  const [uom, setUom] = useState("");
  const { pending, error, run } = useActionRunner();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await run(() => saveWorkInfo(workItemId, undefined, formData));
    if (!result?.error) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          Set up here
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Set up ${workName}`}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`uom-${workItemId}`}>Measured in</Label>
              <UomSelect
                id={`uom-${workItemId}`}
                name="uom"
                uoms={uoms}
                value={uom}
                onChange={(event) => setUom(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`labour-${workItemId}`}>Labour rate (optional)</Label>
              <Input
                id={`labour-${workItemId}`}
                name="labour_rate"
                inputMode="decimal"
                autoComplete="off"
                placeholder={`per ${uom || "unit"}`}
              />
            </div>
          </div>
          <p className="text-muted text-xs">
            Saved in the rate book for this work. Then tap the rate on this row to give it its own
            mix or materials, and its own labour rate if this house differs.
          </p>
          <FormMessage error={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !uom}>
              {pending ? "Saving…" : "Set up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
