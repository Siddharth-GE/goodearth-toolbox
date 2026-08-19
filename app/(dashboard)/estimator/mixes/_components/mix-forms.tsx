"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  addMixComponent,
  createMix,
  deleteMix,
  removeMixComponent,
  removeWorkComponent,
  updateMix,
  updateMixComponentQty,
  updateWorkComponentQty,
} from "@/lib/estimator/actions";
import type { MaterialRow, MixDetail, MixRow } from "@/lib/estimator/queries";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

export function MixFormDialog({
  mix,
  uoms,
  trigger,
}: {
  mix?: MixRow | MixDetail;
  uoms: string[];
  trigger?: React.ReactNode;
}) {
  const isEdit = !!mix;

  return (
    <RecordFormDialog
      label="Mix"
      isEdit={isEdit}
      action={isEdit ? updateMix.bind(null, mix.id) : createMix}
      trigger={trigger}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={mix?.name}
          required
          autoComplete="off"
          placeholder="e.g. M20 concrete"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="uom">One unit of this mix is</Label>
        <Input
          id="uom"
          name="uom"
          defaultValue={mix?.uom}
          required
          autoComplete="off"
          list="estimator-mix-uoms"
          placeholder="e.g. cum"
          maxLength={20}
        />
        <datalist id="estimator-mix-uoms">
          {uoms.map((uom) => (
            <option key={uom} value={uom} />
          ))}
        </datalist>
        <p className="text-muted text-xs">
          Its materials are given per one of these — so for concrete, per cubic metre.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Note (optional)</Label>
        <Input
          id="description"
          name="description"
          defaultValue={mix?.description ?? ""}
          autoComplete="off"
          placeholder="e.g. 1:1.5:3 nominal mix"
        />
      </div>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_active" value="1" defaultChecked={mix?.isActive ?? true} />
        Active
      </label>
    </RecordFormDialog>
  );
}

/** Add one material to a mix. Lives on the mix's own screen, not in a dialog. */
export function AddMixComponentForm({
  mixId,
  mixUom,
  materials,
}: {
  mixId: string;
  mixUom: string;
  materials: MaterialRow[];
}) {
  const [state, formAction, pending] = useActionState(addMixComponent.bind(null, mixId), undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const [materialId, setMaterialId] = useState("");

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
      setMaterialId("");
    }
    wasPending.current = pending;
  }, [pending, state]);

  const chosen = materials.find((material) => material.id === materialId);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="material_id">Material</Label>
          <Select
            id="material_id"
            name="material_id"
            value={materialId}
            onChange={(event) => setMaterialId(event.target.value)}
            required
          >
            <option value="" disabled>
              Choose a material
            </option>
            {materials
              .filter((material) => material.isActive)
              .map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name} ({material.uom})
                </option>
              ))}
          </Select>
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor="qty_per_unit">Quantity</Label>
          <Input
            id="qty_per_unit"
            name="qty_per_unit"
            required
            autoComplete="off"
            inputMode="decimal"
            placeholder="e.g. 8"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <p className="text-muted text-xs">
        {chosen
          ? `How many ${chosen.uom} of ${chosen.name} go into one ${mixUom} of this mix.`
          : `Quantities are per one ${mixUom} of this mix.`}
      </p>
      <FormMessage error={state?.error} />
    </form>
  );
}

/**
 * A component's quantity, editable in place (the StageNameField shape).
 * One field serves both editors — a mix's materials and a work's recipe
 * differ only in which action saves them.
 */
export function ComponentQtyField({
  id,
  qty,
  label,
  kind,
}: {
  id: string;
  qty: number;
  label: string;
  kind: "mix" | "work";
}) {
  const [value, setValue] = useState(String(qty));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const save = () => {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0 || next === qty) {
      setValue(String(qty));
      return;
    }
    startTransition(async () => {
      const result = await (kind === "mix"
        ? updateMixComponentQty(id, next)
        : updateWorkComponentQty(id, next));
      if (result?.error) {
        setError(result.error);
        setValue(String(qty));
      } else {
        setError(undefined);
      }
    });
  };

  return (
    <div className="space-y-1">
      <Input
        aria-label={`Quantity of ${label}`}
        value={value}
        inputMode="decimal"
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "Escape") setValue(String(qty));
        }}
        disabled={pending}
        className="h-9 max-w-32 text-sm"
      />
      <FormMessage error={error} size="xs" />
    </div>
  );
}

export function RemoveComponentButton({
  id,
  kind,
  label,
}: {
  id: string;
  kind: "mix" | "work";
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Remove ${label}`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await (kind === "mix"
              ? removeMixComponent(id)
              : removeWorkComponent(id));
            setError(result?.error);
          })
        }
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
    </div>
  );
}

export function DeleteMixButton({ mixId }: { mixId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteMix(mixId);
            setError(result?.error);
          })
        }
      >
        {pending ? "Deleting…" : "Delete mix"}
      </Button>
    </div>
  );
}
