"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { startChecklist } from "@/lib/supervisors/checklist-actions";

export type StartableTemplate = { id: string; name: string; itemCount: number };

/** Opens a checklist for this villa: one unanswered row per item, then the checklist's own page. */
export function StartChecklistDialog({
  plotId,
  templates,
}: {
  plotId: string;
  templates: StartableTemplate[];
}) {
  return (
    <RecordFormDialog
      label="checklist"
      isEdit={false}
      action={startChecklist}
      trigger={
        <Button variant="secondary" disabled={templates.length === 0}>
          Start a checklist
        </Button>
      }
    >
      <input type="hidden" name="plot_id" value={plotId} />
      <div className="space-y-1.5">
        <Label htmlFor="checklist-template">Checklist</Label>
        <Select id="checklist-template" name="template_id" required defaultValue="">
          <option value="" disabled>
            Pick the checklist…
          </option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {`${template.name} · ${template.itemCount} checks`}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="checklist-location">Location or floor</Label>
        <Input
          id="checklist-location"
          name="location"
          placeholder="e.g. Ground floor, east wall"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="checklist-drawing">Drawing and revision (optional)</Label>
        <Input
          id="checklist-drawing"
          name="drawing_revision"
          placeholder="e.g. ST-04 R2"
          autoComplete="off"
        />
      </div>
    </RecordFormDialog>
  );
}
