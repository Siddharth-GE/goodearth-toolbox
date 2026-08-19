"use client";

import { ProjectPicker } from "@/components/masters/project-picker";
import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  copyTemplateToUnit,
  createEstimate,
  deleteEstimate,
  updateEstimate,
} from "@/lib/estimator/actions";
import type { EstimateDetail, EstimateRow } from "@/lib/estimator/queries";
import type { ProjectRow } from "@/lib/masters/projects";
import type { UnitRow } from "@/lib/masters/units";
import { useState, useTransition } from "react";

/**
 * One dialog makes both kinds: pick a villa for an estimate, leave it
 * blank for a template. That is exactly what the database says a
 * template is (0074's CHECK), so the form can't create a shape the
 * schema would refuse.
 */
export function EstimateFormDialog({
  projects,
  units,
  estimate,
  trigger,
}: {
  projects: ProjectRow[];
  units: UnitRow[];
  estimate?: EstimateDetail;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!estimate;
  const [projectId, setProjectId] = useState(estimate?.projectId ?? "");
  const projectUnits = units.filter((unit) => unit.project_id === projectId);

  if (isEdit) {
    // Editing touches only the name and note — a villa or project change
    // would be a different estimate, not an edited one.
    return (
      <RecordFormDialog
        label="Estimate"
        isEdit
        action={updateEstimate.bind(null, estimate.id)}
        trigger={trigger}
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={estimate.name} required autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" name="note" defaultValue={estimate.note ?? ""} autoComplete="off" />
        </div>
      </RecordFormDialog>
    );
  }

  return (
    <RecordFormDialog
      label="Estimate"
      isEdit={false}
      action={createEstimate}
      trigger={trigger}
      onOpen={() => setProjectId("")}
    >
      <div className="space-y-1.5">
        <Label htmlFor="project_id">Project</Label>
        <ProjectPicker
          id="project_id"
          name="project_id"
          projects={projects}
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="unit_id">Villa</Label>
        <Select id="unit_id" name="unit_id" defaultValue="" disabled={!projectId}>
          <option value="">No villa — this is a template</option>
          {projectUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </Select>
        <p className="text-muted text-xs">
          A template is an estimate with no villa — the standard villa you copy onto the real ones.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          autoComplete="off"
          placeholder="e.g. Standard villa — 3BHK"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" autoComplete="off" />
      </div>
    </RecordFormDialog>
  );
}

/** Copy a template onto a villa — how every real estimate starts. */
export function CopyTemplateDialog({
  template,
  units,
  trigger,
}: {
  template: EstimateRow;
  units: UnitRow[];
  trigger?: React.ReactNode;
}) {
  const projectUnits = units.filter((unit) => unit.project_id === template.projectId);

  return (
    <RecordFormDialog
      label="Copy"
      isEdit={false}
      action={copyTemplateToUnit}
      trigger={trigger ?? <Button variant="secondary">Copy to villa</Button>}
    >
      <input type="hidden" name="template_id" value={template.id} />
      <div className="space-y-1.5">
        <Label htmlFor={`unit-${template.id}`}>Villa</Label>
        <Select id={`unit-${template.id}`} name="unit_id" defaultValue="" required>
          <option value="" disabled>
            Choose a villa
          </option>
          {projectUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </Select>
        <p className="text-muted text-xs">
          Villas of {template.projectName}, the template&apos;s own project.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`name-${template.id}`}>Name (optional)</Label>
        <Input
          id={`name-${template.id}`}
          name="name"
          autoComplete="off"
          placeholder={`${template.name} — villa name`}
        />
      </div>
      <p className="text-muted text-xs">
        Copies the {template.lineCount} {template.lineCount === 1 ? "work" : "works"} and their
        quantities. Costs come from today&apos;s rates, so there is nothing else to copy.
      </p>
    </RecordFormDialog>
  );
}

export function DeleteEstimateButton({ estimateId }: { estimateId: string }) {
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
            const result = await deleteEstimate(estimateId);
            setError(result?.error);
          })
        }
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}
