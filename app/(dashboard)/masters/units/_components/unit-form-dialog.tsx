"use client";

import { ProjectPicker } from "@/components/masters/project-picker";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ClientRow } from "@/lib/masters/clients";
import type { PlotRow } from "@/lib/masters/plots";
import type { ProjectRow } from "@/lib/masters/projects";
import type { UnitRow } from "@/lib/masters/units";
import { createUnit, updateUnit } from "@/lib/masters/units-actions";
import { useActionState, useEffect, useRef, useState } from "react";

export function UnitFormDialog({
  projects,
  plots,
  clients,
  unit,
}: {
  projects: ProjectRow[];
  plots: PlotRow[];
  clients: ClientRow[];
  unit?: UnitRow;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = !!unit;
  const action = isEdit ? updateUnit.bind(null, unit.id) : createUnit;
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPending = useRef(false);
  const [projectId, setProjectId] = useState(unit?.project_id ?? "");

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  // Reset the plot-filtering project selection whenever the dialog is
  // (re)opened, so a cancelled edit doesn't leave a stale in-progress
  // choice behind next time — done in this event handler (a direct
  // response to the open/close action), not an effect.
  function handleOpenChange(next: boolean) {
    if (next) setProjectId(unit?.project_id ?? "");
    setOpen(next);
  }

  const filteredPlots = plots.filter((plot) => plot.project_id === projectId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "secondary" : "primary"}>{isEdit ? "Edit" : "New Unit"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Unit" : "New Unit"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
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
            <Label htmlFor="plot_id">Plot (optional)</Label>
            <Select
              id="plot_id"
              name="plot_id"
              defaultValue={unit?.plot_id ?? ""}
              disabled={!projectId}
            >
              <option value="">No plot</option>
              {filteredPlots.map((plot) => (
                <option key={plot.id} value={plot.id}>
                  {plot.name}
                </option>
              ))}
            </Select>
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
              {clients.map((client) => (
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
          {state?.error && <p className="text-danger text-sm font-medium">{state.error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
