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
import { createPlot, updatePlot } from "@/lib/masters/plots-actions";
import type { PlotRow } from "@/lib/masters/plots";
import type { ProjectRow } from "@/lib/masters/projects";
import { useActionState, useEffect, useRef, useState } from "react";

export function PlotFormDialog({ projects, plot }: { projects: ProjectRow[]; plot?: PlotRow }) {
  const [open, setOpen] = useState(false);
  const isEdit = !!plot;
  const action = isEdit ? updatePlot.bind(null, plot.id) : createPlot;
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "secondary" : "primary"}>{isEdit ? "Edit" : "New Plot"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Plot" : "New Plot"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
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
          {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
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
