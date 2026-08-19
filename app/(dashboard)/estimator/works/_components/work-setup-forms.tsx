"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addWorkComponent, saveWorkInfo } from "@/lib/estimator/actions";
import { UomSelect } from "../../_components/uom-select";
import type { MaterialRow, MixRow, WorkSetup } from "@/lib/estimator/queries";
import { useActionState, useEffect, useRef, useState } from "react";

/**
 * The work's unit and labour rate.
 *
 * Changing the unit once estimate lines exist silently changes what
 * every one of those quantities means — 40 "cum" becoming 40 "sqm" is
 * the same number describing a different building. The form says so
 * before it lets the change through.
 */
export function WorkInfoForm({ work, uoms }: { work: WorkSetup; uoms: string[] }) {
  const [state, formAction, pending] = useActionState(
    saveWorkInfo.bind(null, work.workItemId),
    undefined,
  );
  const [uom, setUom] = useState(work.uom ?? "");
  const unitChanged = work.uom !== null && uom.trim() !== work.uom;
  const risky = unitChanged && work.lineCount > 0;

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44 space-y-1.5">
          <Label htmlFor="uom">Measured in</Label>
          <UomSelect
            id="uom"
            name="uom"
            uoms={uoms}
            current={work.uom}
            value={uom}
            onChange={(event) => setUom(event.target.value)}
            required
          />
        </div>
        <div className="w-44 space-y-1.5">
          <Label htmlFor="labour_rate">Labour rate</Label>
          <Input
            id="labour_rate"
            name="labour_rate"
            defaultValue={work.labourRate ?? ""}
            autoComplete="off"
            inputMode="decimal"
            placeholder="e.g. 900"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : work.uom === null ? "Set up" : "Save"}
        </Button>
      </div>
      <p className="text-muted text-xs">
        The labour rate is per {uom.trim() || "unit"}. Leave it blank if it isn&apos;t priced yet —
        estimates will say the cost is unknown rather than counting the labour as free.
      </p>
      {risky && (
        <p className="text-warning text-sm">
          This work is on {work.lineCount} estimate {work.lineCount === 1 ? "line" : "lines"}.
          Changing the unit from {work.uom} to {uom.trim()} changes what those quantities mean —
          check them afterwards.
        </p>
      )}
      <FormMessage error={state?.error} />
    </form>
  );
}

/** Add one thing to the recipe: a material, or a whole mix. */
export function AddWorkComponentForm({
  workItemId,
  workUom,
  materials,
  mixes,
}: {
  workItemId: string;
  workUom: string;
  materials: MaterialRow[];
  mixes: MixRow[];
}) {
  const [state, formAction, pending] = useActionState(
    addWorkComponent.bind(null, workItemId),
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const [choice, setChoice] = useState("");

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
      setChoice("");
    }
    wasPending.current = pending;
  }, [pending, state]);

  const [kind, refId] = choice.split(":");
  const chosenUom =
    kind === "material"
      ? materials.find((material) => material.id === refId)?.uom
      : mixes.find((mix) => mix.id === refId)?.uom;

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="component">Material or mix</Label>
          <Select
            id="component"
            name="component"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            required
          >
            <option value="" disabled>
              Choose what this work consumes
            </option>
            <optgroup label="Mixes">
              {mixes
                .filter((mix) => mix.isActive)
                .map((mix) => (
                  <option key={mix.id} value={`mix:${mix.id}`}>
                    {mix.name} ({mix.uom})
                  </option>
                ))}
            </optgroup>
            <optgroup label="Materials">
              {materials
                .filter((material) => material.isActive)
                .map((material) => (
                  <option key={material.id} value={`material:${material.id}`}>
                    {material.name} ({material.uom})
                  </option>
                ))}
            </optgroup>
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
            placeholder="e.g. 1"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <p className="text-muted text-xs">
        {chosenUom
          ? `How many ${chosenUom} are needed for one ${workUom} of this work.`
          : `Quantities are per one ${workUom} of this work.`}
      </p>
      <FormMessage error={state?.error} />
    </form>
  );
}
