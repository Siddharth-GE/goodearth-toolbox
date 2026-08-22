"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTransmittal } from "@/lib/design-management/actions";

/**
 * Start a transmittal for this villa. Two questions only — the design
 * stage it goes out at, and an optional note — and then it opens.
 *
 * Founder, 2026-08-22, redirecting the flow on the staging vet: "press
 * new transmittal, upload the docs and issue to site". The drawings are
 * chosen, revised and uploaded ON the transmittal, because that is the
 * order the work actually happens in; picking finished drawings up front
 * assumed they already existed.
 */
export function CreateTransmittalDialog({
  unitId,
  stages,
}: {
  unitId: string;
  stages: { id: string; name: string }[];
}) {
  // Nowhere to file it: say why rather than opening a dialog that can
  // only fail. Stages are a master, one click away in this same tool.
  if (stages.length === 0) {
    return (
      <Button variant="secondary" disabled>
        No design stages yet
      </Button>
    );
  }

  return (
    <RecordFormDialog
      label="Transmittal"
      isEdit={false}
      action={createTransmittal.bind(null, unitId)}
      trigger={<Button>New transmittal</Button>}
    >
      <div className="space-y-1.5">
        <Label htmlFor="design_stage_id">Design stage</Label>
        <Select id="design_stage_id" name="design_stage_id" required defaultValue="">
          <option value="" disabled>
            Choose a stage…
          </option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          placeholder="Anything site should know about this issue…"
        />
      </div>

      <p className="text-muted text-xs">
        Saving opens the transmittal. Add or revise its drawings there, then press Issue to send
        them to site.
      </p>
    </RecordFormDialog>
  );
}
