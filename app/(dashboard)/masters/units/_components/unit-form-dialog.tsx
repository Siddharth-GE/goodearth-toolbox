"use client";

import { ProjectPicker } from "@/components/masters/project-picker";
import { useState } from "react";
import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ClientRow } from "@/lib/masters/clients";
import type { PlotRow } from "@/lib/masters/plots";
import type { ProjectRow } from "@/lib/masters/projects";
import type { UnitRow } from "@/lib/masters/units";
import { createUnit, deleteUnit, updateUnit } from "@/lib/masters/units-actions";
import { useMastersAdmin } from "../../_components/masters-admin";

export function UnitFormDialog({
  projects,
  plots,
  units,
  clients,
  unit,
}: {
  projects: ProjectRow[];
  plots: PlotRow[];
  units: UnitRow[];
  clients: ClientRow[];
  unit?: UnitRow;
}) {
  const isEdit = !!unit;
  const isAdmin = useMastersAdmin();
  // Only plots without a unit are offered, plus the unit's own when editing (0029); the DB's unique index is the backstop.
  const [projectId, setProjectId] = useState(unit?.project_id ?? "");
  const takenPlotIds = new Set(
    units.filter((candidate) => candidate.id !== unit?.id).map((candidate) => candidate.plot_id),
  );
  const filteredPlots = plots.filter(
    (plot) => plot.project_id === projectId && !takenPlotIds.has(plot.id),
  );
  // Deactivated clients stay visible on a unit already assigned to one.
  const pickableClients = clients.filter(
    (client) => client.is_active || client.id === unit?.client_id,
  );

  return (
    <RecordFormDialog
      label="Unit"
      isEdit={isEdit}
      action={isEdit ? updateUnit.bind(null, unit.id) : createUnit}
      onDelete={isAdmin && unit ? () => deleteUnit(unit.id) : undefined}
      onOpen={() => setProjectId(unit?.project_id ?? "")}
    >
      <div className="space-y-1.5">
        <Label htmlFor="project_id">Project</Label>
        <ProjectPicker
          id="project_id"
          name="project_id"
          projects={projects}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="plot_id">Plot</Label>
        <Select
          id="plot_id"
          name="plot_id"
          defaultValue={unit?.plot_id ?? ""}
          disabled={!projectId}
          required
        >
          <option value="" disabled>
            {projectId && filteredPlots.length === 0
              ? "No free plots — create the plot first"
              : "Choose a plot"}
          </option>
          {filteredPlots.map((plot) => (
            <option key={plot.id} value={plot.id}>
              {plot.name}
            </option>
          ))}
        </Select>
        <p className="text-muted text-xs">
          Every unit sits on exactly one plot. Plots that already have a unit aren&apos;t offered.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={unit?.name}
          required
          autoComplete="off"
          placeholder="e.g. Villa 3"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          defaultValue={unit?.code ?? ""}
          autoComplete="off"
          placeholder="V12A"
          maxLength={10}
        />
        <p className="text-muted text-xs">
          Short code used in PO numbers, e.g. V12A → PO/SAA/V12A/001. Needed before purchase orders
          can be raised for this unit.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="unit_type">Unit type</Label>
        <Select id="unit_type" name="unit_type" defaultValue={unit?.unit_type ?? ""} required>
          <option value="" disabled>
            Select a type
          </option>
          <option value="apartment">Apartment</option>
          <option value="villa">Villa</option>
          <option value="duplex_row_house">Duplex / row house</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="client_id">Client (optional)</Label>
        <Select id="client_id" name="client_id" defaultValue={unit?.client_id ?? ""}>
          <option value="">Unassigned</option>
          {pickableClients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={unit?.status ?? "available"}>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
        </Select>
      </div>
    </RecordFormDialog>
  );
}
