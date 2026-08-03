"use client";

import { ProjectPicker } from "@/components/masters/project-picker";
import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createPlot, updatePlot } from "@/lib/masters/plots-actions";
import type { PlotRow } from "@/lib/masters/plots";
import type { ProjectRow } from "@/lib/masters/projects";

export function PlotFormDialog({ projects, plot }: { projects: ProjectRow[]; plot?: PlotRow }) {
  const isEdit = !!plot;

  return (
    <RecordFormDialog
      label="Plot"
      isEdit={isEdit}
      action={isEdit ? updatePlot.bind(null, plot.id) : createPlot}
    >
      <div className="space-y-1.5">
        <Label htmlFor="project_id">Project</Label>
        <ProjectPicker
          id="project_id"
          name="project_id"
          projects={projects}
          defaultValue={plot?.project_id ?? ""}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name / number</Label>
        <Input id="name" name="name" defaultValue={plot?.name} required autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          defaultValue={plot?.code ?? ""}
          autoComplete="off"
          placeholder="P12"
          maxLength={10}
        />
        <p className="text-muted text-xs">
          Short code used in PO numbers, e.g. P12 → PO/SAA/P12/001. Needed before purchase orders
          can be raised for this plot.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="area">Area</Label>
        <Input id="area" name="area" type="number" step="0.01" defaultValue={plot?.area ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={plot?.status ?? "available"}>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
        </Select>
      </div>
    </RecordFormDialog>
  );
}
