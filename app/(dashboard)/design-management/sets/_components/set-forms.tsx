"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createDrawingSet,
  deleteDrawingSet,
  setDrawingSetActive,
  updateDrawingSet,
} from "@/lib/design-management/actions";
import type { DrawingSetDetail } from "@/lib/design-management/queries";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";

export function DrawingSetFormDialog({
  set,
  trigger,
}: {
  set?: Pick<DrawingSetDetail, "id" | "code" | "name" | "description">;
  trigger?: ReactNode;
}) {
  const isEdit = !!set;
  return (
    <RecordFormDialog
      label="Drawing Set"
      isEdit={isEdit}
      action={isEdit ? updateDrawingSet.bind(null, set.id) : createDrawingSet}
      trigger={trigger}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={set?.name}
          required
          autoComplete="off"
          placeholder="e.g. Working Drawings — Ground Floor"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="code">Code (optional)</Label>
        <Input
          id="code"
          name="code"
          defaultValue={set?.code ?? ""}
          autoComplete="off"
          placeholder="e.g. WD-GF"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={set?.description ?? ""}
        />
      </div>
    </RecordFormDialog>
  );
}

export function DrawingSetToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setDrawingSetActive(id, !isActive);
            setError(result?.error);
          })
        }
      >
        {pending ? "Saving…" : isActive ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}

/**
 * Only actually removes the row when nothing references it — the FK
 * refusal comes back as a friendly ActionState error (deleteDrawingSet
 * in lib/design-management/actions.ts), never a throw. Deactivate is
 * the everyday path once a set is in use; this is for a set added by
 * mistake with nothing built on it yet.
 */
export function DrawingSetDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteDrawingSet(id);
            if (result?.error) setError(result.error);
            else router.push("/design-management/sets");
          })
        }
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}
