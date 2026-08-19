"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { UomSelect } from "../../_components/uom-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMaterial, deleteMaterial, updateMaterial } from "@/lib/estimator/actions";
import type { MaterialRow } from "@/lib/estimator/queries";
import { useState, useTransition } from "react";

export function MaterialFormDialog({
  material,
  uoms,
  trigger,
}: {
  material?: MaterialRow;
  /** Units already in use, offered as suggestions so spelling stays put. */
  uoms: string[];
  trigger?: React.ReactNode;
}) {
  const isEdit = !!material;

  return (
    <RecordFormDialog
      label="Material"
      isEdit={isEdit}
      action={isEdit ? updateMaterial.bind(null, material.id) : createMaterial}
      trigger={trigger}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={material?.name}
          required
          autoComplete="off"
          placeholder="e.g. OPC 53 Cement"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="uom">Measured in</Label>
        <UomSelect
          id="uom"
          name="uom"
          uoms={uoms}
          current={material?.uom}
          defaultValue={material?.uom ?? ""}
          required
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
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_active" value="1" defaultChecked={material?.isActive ?? true} />
        Active
      </label>
    </RecordFormDialog>
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
