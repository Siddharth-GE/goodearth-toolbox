"use client";

import { Badge } from "@/components/ui/badge";
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
import { Select } from "@/components/ui/select";
import {
  addLineComponent,
  customiseEstimateLine,
  removeLineComponent,
  resetEstimateLine,
  setEstimateItemRate,
  updateEstimateLineLabourRate,
  updateLineComponentQty,
} from "@/lib/estimator/estimate-actions";
import { formatQuantity } from "@/lib/format";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

/** One row of the recipe as the dialog shows it. `id` is null for a
 * standard (read-only) row — only a customised line's rows have their
 * own ids to edit. */
export type VariationRowView = {
  id: string | null;
  kind: "material" | "mix";
  refId: string;
  name: string;
  uom: string;
  qtyPerUnit: number;
};

export type VariationOptions = {
  materials: { id: string; name: string; uom: string }[];
  mixes: { id: string; name: string; uom: string }[];
};

/**
 * "Every house is different" (founder, 0087): the standard recipe from
 * the Works tab, editable for THIS villa only. Customising copies the
 * standard; from then on the line's own list is what it means, and it
 * stops following the standard. Reset deletes the copy.
 */
export function LineVariationDialog({
  lineId,
  workName,
  workUom,
  customised,
  rows,
  options,
  labourRate,
  standardLabourRate,
}: {
  lineId: string;
  workName: string;
  workUom: string | null;
  customised: boolean;
  rows: VariationRowView[];
  options: VariationOptions;
  /** This villa's labour rate (0088); null = the work's standard. */
  labourRate: number | null;
  standardLabourRate: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  // A labour-only work has no standard materials to copy, so
  // "Customise" would write nothing and look broken (it did, on
  // 2026-08-20). With an empty standard the add form comes out
  // straight away — the first material added IS this villa's version.
  // A standard WITH materials still copies first, or adding one would
  // silently drop the rest.
  const emptyStandard = !customised && rows.length === 0;
  const canEdit = customised || emptyStandard;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          {customised ? (
            <span className="inline-flex items-center gap-1.5">
              Variation
              <Badge variant="info">Varied</Badge>
            </span>
          ) : (
            "Variation"
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {workName} — {customised ? "this villa's version" : "standard recipe"}
          </DialogTitle>
        </DialogHeader>

        <LabourRateField
          lineId={lineId}
          rate={labourRate}
          standardRate={standardLabourRate}
          workUom={workUom}
        />

        <p className="text-muted text-xs font-semibold tracking-widest uppercase">Materials</p>

        {rows.length === 0 ? (
          <p className="text-muted text-sm">
            {customised
              ? "Nothing in this villa's version yet — add its materials below."
              : "This work is labour only — the standard recipe has no materials. Anything you add below applies to this villa alone."}
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((row) => (
              <li
                key={row.id ?? `${row.kind}-${row.refId}`}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="text-foreground min-w-0 text-sm">
                  {row.name}
                  {row.kind === "mix" && (
                    <Badge variant="neutral" className="ml-1.5">
                      Mix
                    </Badge>
                  )}
                </span>
                {customised && row.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <ComponentQtyField id={row.id} qty={row.qtyPerUnit} label={row.name} />
                    <span className="text-muted text-xs">
                      {row.uom}
                      {workUom ? ` / ${workUom}` : ""}
                    </span>
                    <RemoveComponentButton id={row.id} isLast={rows.length === 1} />
                  </span>
                ) : (
                  <span className="text-muted shrink-0 text-sm">
                    {formatQuantity(row.qtyPerUnit)} {row.uom}
                    {workUom ? ` / ${workUom}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <>
            <AddComponentForm lineId={lineId} options={options} workUom={workUom} />
            <p className="text-muted text-xs">
              This villa&apos;s version stands on its own — later changes to the standard recipe
              won&apos;t touch it. Removing the last material returns the work to standard.
            </p>
          </>
        ) : (
          <p className="text-muted text-xs">
            This work follows the standard recipe from the Works tab. Customising copies it for this
            villa only — the standard, and other villas, stay as they are.
          </p>
        )}

        <FormMessage error={error} />
        <DialogFooter>
          {customised && (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await resetEstimateLine(lineId);
                  setError(result?.error);
                })
              }
            >
              Reset to standard
            </Button>
          )}
          {!canEdit && (
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await customiseEstimateLine(lineId);
                  setError(result?.error);
                })
              }
            >
              Customise for this villa
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="ghost">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * This villa's labour rate for the work (0088) — blank means the
 * work's standard rate from the Works tab, and the placeholder shows
 * what that is. Independent of the recipe variation: a plot can pay
 * differently for exactly the standard work.
 */
function LabourRateField({
  lineId,
  rate,
  standardRate,
  workUom,
}: {
  lineId: string;
  rate: number | null;
  standardRate: number | null;
  workUom: string | null;
}) {
  const [value, setValue] = useState(rate === null ? "" : String(rate));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const save = () => {
    const cleaned = value.replace(/[,\s₹]/g, "");
    // Blank clears the override; 0 is a real rate, not "unpriced".
    const next = cleaned === "" ? null : Number(cleaned);
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      setValue(rate === null ? "" : String(rate));
      setError("The labour rate must be a number, or blank for the standard.");
      return;
    }
    if (next === rate) return;
    startTransition(async () => {
      const result = await updateEstimateLineLabourRate(lineId, next);
      if (result?.error) {
        setError(result.error);
        setValue(rate === null ? "" : String(rate));
      } else setError(undefined);
    });
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`labour-${lineId}`}>Labour rate for this villa</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`labour-${lineId}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          disabled={pending}
          inputMode="decimal"
          placeholder={standardRate === null ? "Not priced" : `Standard: ${standardRate}`}
          className="max-w-40"
        />
        <span className="text-muted text-xs">{workUom ? `per ${workUom}` : ""}</span>
        {rate !== null && <Badge variant="info">Varied</Badge>}
      </div>
      <p className="text-muted text-xs">
        Leave blank to use the standard rate from the Works tab. This villa&apos;s rate applies to
        this work here only.
      </p>
      <FormMessage error={error} />
    </div>
  );
}

/** Inline per-unit quantity, saved on blur/Enter — the LineQtyField shape. */
function ComponentQtyField({ id, qty, label }: { id: string; qty: number; label: string }) {
  const [value, setValue] = useState(String(qty));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const save = () => {
    const next = Number(value.replace(/[,\s]/g, ""));
    if (!Number.isFinite(next) || next <= 0 || next === qty) {
      setValue(String(qty));
      return;
    }
    startTransition(async () => {
      const result = await updateLineComponentQty(id, next);
      if (result?.error) {
        setError(result.error);
        setValue(String(qty));
      } else setError(undefined);
    });
  };

  return (
    <span className="inline-flex items-center gap-1">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        disabled={pending}
        inputMode="decimal"
        aria-label={`Quantity of ${label}`}
        className="h-9 w-20 text-right"
      />
      <FormMessage error={error} />
    </span>
  );
}

function RemoveComponentButton({ id, isLast }: { id: string; isLast: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="inline-flex items-center gap-1">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        title={isLast ? "Removing the last material returns this work to standard." : undefined}
        onClick={() =>
          startTransition(async () => {
            const result = await removeLineComponent(id);
            setError(result?.error);
          })
        }
      >
        Remove
      </Button>
    </span>
  );
}

function AddComponentForm({
  lineId,
  options,
  workUom,
}: {
  lineId: string;
  options: VariationOptions;
  workUom: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    addLineComponent.bind(null, lineId),
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
      ? options.materials.find((material) => material.id === refId)?.uom
      : options.mixes.find((mix) => mix.id === refId)?.uom;

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor={`component-${lineId}`}>Add for this villa</Label>
          <Select
            id={`component-${lineId}`}
            name="component"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            required
          >
            <option value="" disabled>
              Material or mix…
            </option>
            <optgroup label="Materials (from Masters)">
              {options.materials.map((material) => (
                <option key={material.id} value={`material:${material.id}`}>
                  {material.name} ({material.uom})
                </option>
              ))}
            </optgroup>
            {options.mixes.length > 0 && (
              <optgroup label="Mixes">
                {options.mixes.map((mix) => (
                  <option key={mix.id} value={`mix:${mix.id}`}>
                    {mix.name} ({mix.uom})
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>
        <div className="w-28 space-y-1.5">
          <Label htmlFor={`qty-${lineId}`}>Quantity</Label>
          <Input
            id={`qty-${lineId}`}
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
      {chosenUom && workUom && (
        <p className="text-muted text-xs">
          How many {chosenUom} one {workUom} of this work needs, for this villa.
        </p>
      )}
      <FormMessage error={state?.error} />
    </form>
  );
}

/**
 * This villa's price for one material (0088) — blank uses the price
 * from Masters, shown as the placeholder. Saved per ESTIMATE, not per
 * work: cement costing more at a far plot costs more everywhere in the
 * house, and one price per material means two works can never
 * disagree.
 */
export function ItemRateField({
  estimateId,
  itemId,
  materialId,
  rate,
  standardRate,
  label,
}: {
  estimateId: string;
  itemId: string | null;
  materialId: string | null;
  rate: number | null;
  standardRate: number | null;
  label: string;
}) {
  const [value, setValue] = useState(rate === null ? "" : String(rate));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const save = () => {
    const cleaned = value.replace(/[,s₹]/g, "");
    const next = cleaned === "" ? null : Number(cleaned);
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      setValue(rate === null ? "" : String(rate));
      setError("The price must be a number, or blank for the Masters price.");
      return;
    }
    if (next === rate) return;
    startTransition(async () => {
      const result = await setEstimateItemRate(estimateId, { itemId, materialId }, next);
      if (result?.error) {
        setError(result.error);
        setValue(rate === null ? "" : String(rate));
      } else setError(undefined);
    });
  };

  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <FormMessage error={error} />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        disabled={pending}
        inputMode="decimal"
        aria-label={`This villa's price for ${label}`}
        placeholder={standardRate === null ? "Not priced" : String(standardRate)}
        className="h-9 w-24 text-right"
      />
      {rate !== null && <Badge variant="info">Varied</Badge>}
    </span>
  );
}
