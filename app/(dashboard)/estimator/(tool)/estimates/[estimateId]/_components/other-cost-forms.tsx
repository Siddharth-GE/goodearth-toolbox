"use client";

import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import {
  addOtherCost,
  deleteOtherCost,
  setUseModelMaterials,
  updateOtherCost,
} from "@/lib/estimator/estimate-actions";
import type { OtherCostRow } from "@/lib/estimator/estimate-queries";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useId, useState } from "react";

/** Materials from the model until the final QS, then from the Rate book (the founder, 2026-10-29). */
export function MaterialsFromChoice({
  estimateId,
  useModel,
}: {
  estimateId: string;
  useModel: boolean;
}) {
  const { pending, error, run } = useActionRunner();
  return (
    <div className="space-y-1">
      <ChoiceChips
        label="Materials from"
        options={[
          { value: "model", label: "The SketchUp model" },
          { value: "rate_book", label: "The Rate book" },
        ]}
        value={useModel ? "model" : "rate_book"}
        required
        disabled={pending}
        onChange={(value) => {
          if (value) void run(() => setUseModelMaterials(estimateId, value === "model"));
        }}
      />
      <FormMessage error={error} size="xs" />
    </div>
  );
}

/** Add or change a typed cost. The model's own rows never come here. */
export function OtherCostDialog({
  estimateId,
  cost,
}: {
  estimateId: string;
  cost?: OtherCostRow;
}) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useActionRunner();
  const id = useId();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await run(() =>
      cost
        ? updateOtherCost(cost.id, undefined, formData)
        : addOtherCost(estimateId, undefined, formData),
    );
    if (!result?.error) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={cost ? "ghost" : "secondary"} size="sm">
          {cost ? "Change" : "Add a cost"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cost ? `Change ${cost.name}` : "Add a cost"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>What it is for</Label>
            <Input
              id={`${id}-name`}
              name="name"
              defaultValue={cost?.name ?? ""}
              maxLength={200}
              placeholder="Compound wall, gate"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-qty`}>Quantity</Label>
              <Input
                id={`${id}-qty`}
                name="qty"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={cost?.qty ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-unit`}>Unit</Label>
              <Input
                id={`${id}-unit`}
                name="unit"
                maxLength={40}
                defaultValue={cost?.unit ?? ""}
                placeholder="LS, nos, sqft"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-rate`}>Rate (₹)</Label>
              <Input
                id={`${id}-rate`}
                name="rate"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={cost?.rate ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-code`}>Code (optional)</Label>
              <Input
                id={`${id}-code`}
                name="code"
                maxLength={40}
                defaultValue={cost?.code ?? ""}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${id}-note`}>Note (optional)</Label>
              <Input
                id={`${id}-note`}
                name="note"
                maxLength={500}
                defaultValue={cost?.note ?? ""}
              />
            </div>
          </div>
          <p className="text-muted text-xs">
            Typed costs stay when the model is sent again. Leave the rate blank until it is known —
            the total says it is missing rather than counting it as nothing.
          </p>
          <FormMessage error={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : cost ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteOtherCostButton({ cost }: { cost: OtherCostRow }) {
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          Remove
        </Button>
      }
      title={`Remove ${cost.name}?`}
      description="It comes off this estimate's total. Nothing else changes."
      confirmLabel="Remove"
      pendingLabel="Removing…"
      onConfirm={() => deleteOtherCost(cost.id)}
    />
  );
}
