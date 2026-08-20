"use client";

import { CataloguePickerDialog, type PickedLine } from "@/components/masters/catalogue-picker";
import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { UomSelect } from "../../_components/uom-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMaterial, deleteMaterial, updateMaterial } from "@/lib/estimator/actions";
import { sameUom } from "@/lib/estimator/link";
import type { MaterialRow } from "@/lib/estimator/queries";
import { useState, useTransition } from "react";

type LinkedItem = { id: string; name: string; code: string | null; default_uom: string };

export function MaterialFormDialog({
  material,
  uoms,
  categories,
  brands,
  trigger,
}: {
  material?: MaterialRow;
  /** Units already in use, offered as suggestions so spelling stays put. */
  uoms: string[];
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  trigger?: React.ReactNode;
}) {
  const isEdit = !!material;

  const savedItem: LinkedItem | null =
    material?.itemId && material.itemName && material.itemDefaultUom
      ? {
          id: material.itemId,
          name: material.itemName,
          code: material.itemCode,
          default_uom: material.itemDefaultUom,
        }
      : null;

  // The link, name and uom live OUTSIDE the dialog content (which Radix
  // unmounts on close), so onOpen resets them to the saved row. Name and
  // uom are controlled so picking the master item can prefill them —
  // since 0085 the master is the one material list (founder,
  // 2026-08-20), and this dialog only adds the estimator's rate card on
  // top of a picked item.
  const [linked, setLinked] = useState<LinkedItem | null>(savedItem);
  const [name, setName] = useState(material?.name ?? "");
  const [uom, setUom] = useState(material?.uom ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);

  // The factor row earns its place only when the two sides measure
  // differently — cement bought and estimated by the bag needs nothing.
  const unitsDiffer = !!linked && !!uom && !sameUom(uom, linked.default_uom);

  const choose = (picked: PickedLine[]) => {
    const first = picked[0];
    if (first) {
      setLinked({
        id: first.item.id,
        name: first.item.name,
        code: first.item.code,
        default_uom: first.item.default_uom,
      });
      // Prefill what the master already knows; keep anything typed.
      setName((current) => (current.trim() ? current : first.item.name));
      setUom((current) => current || first.item.default_uom);
    }
    return Promise.resolve(undefined);
  };

  return (
    <>
      <RecordFormDialog
        label="Material"
        isEdit={isEdit}
        action={isEdit ? updateMaterial.bind(null, material.id) : createMaterial}
        trigger={trigger}
        onOpen={() => {
          setLinked(savedItem);
          setName(material?.name ?? "");
          setUom(material?.uom ?? "");
        }}
      >
        <input type="hidden" name="item_id" value={linked?.id ?? ""} />
        <div className="space-y-1.5">
          <Label>Item from Masters</Label>
          {linked ? (
            <div className="border-border flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="text-foreground min-w-0 truncate">
                {linked.name}
                {linked.code ? <span className="text-muted"> · {linked.code}</span> : null}
                <span className="text-muted"> · {linked.default_uom}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => setPickerOpen(true)}
              >
                Change
              </Button>
            </div>
          ) : (
            <div>
              <Button type="button" variant="secondary" onClick={() => setPickerOpen(true)}>
                Pick the item
              </Button>
            </div>
          )}
          <p className="text-muted text-xs">
            The master is the one material list — a material here is a master item plus the
            estimator&apos;s rate and unit. It is also what lets estimates feed requests, and store
            issues be compared against the estimate.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Shown in estimates as</Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="off"
            placeholder="e.g. OPC 53 Cement"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="uom">Estimated in</Label>
          <UomSelect
            id="uom"
            name="uom"
            uoms={uoms}
            current={material?.uom}
            value={uom}
            required
            onChange={(event) => setUom(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rate">Rate per unit</Label>
          <Input
            id="rate"
            name="rate"
            defaultValue={material?.rate ?? ""}
            autoComplete="off"
            inputMode="decimal"
            placeholder="e.g. 400"
          />
          <p className="text-muted text-xs">
            Leave blank if it isn&apos;t priced yet — estimates will show the quantity and say the
            cost is unknown, rather than counting it as free.
          </p>
        </div>

        {unitsDiffer && (
          <div className="space-y-1.5">
            <Label htmlFor="item_uom_factor">Conversion</Label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted shrink-0">1 {uom} =</span>
              <Input
                id="item_uom_factor"
                name="item_uom_factor"
                defaultValue={material?.itemUomFactor ?? ""}
                autoComplete="off"
                inputMode="decimal"
                placeholder="e.g. 35.31"
                className="max-w-28"
              />
              <span className="text-muted shrink-0">{linked?.default_uom}</span>
            </div>
            <p className="text-muted text-xs">
              The estimate measures in {uom}, the store moves {linked?.default_uom}. Leave blank if
              nobody has settled the conversion — requests will then ask for the quantity by hand.
            </p>
          </div>
        )}

        <label className="text-foreground flex items-center gap-2 text-sm">
          <Checkbox name="is_active" value="1" defaultChecked={material?.isActive ?? true} />
          Active
        </label>
      </RecordFormDialog>

      <CataloguePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Pick the item this material is bought as"
        targetLabel="this material"
        categories={categories}
        brands={brands}
        onCommit={choose}
      />
    </>
  );
}

export function DeleteMaterialButton({ material }: { material: MaterialRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteMaterial(material.id);
            setError(result?.error);
          })
        }
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}
