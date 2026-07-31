"use client";

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
import { createProject, updateProject } from "@/lib/masters/projects-actions";
import type { ProjectRow } from "@/lib/masters/projects";
import { useActionState, useEffect, useRef, useState } from "react";

export function ProjectFormDialog({ project }: { project?: ProjectRow }) {
  const [open, setOpen] = useState(false);
  const isEdit = !!project;
  const action = isEdit ? updateProject.bind(null, project.id) : createProject;
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "secondary" : "primary"}>{isEdit ? "Edit" : "New Project"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={project?.name} required autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" defaultValue={project?.location ?? ""} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project_type">Project type</Label>
            <Select id="project_type" name="project_type" defaultValue={project?.project_type ?? ""} required>
              <option value="" disabled>
                Select a type
              </option>
              <option value="apartment_villa_community">Apartment / villa community</option>
              <option value="eco_village">Eco-village (plots + villas)</option>
              <option value="mixed_residential_commercial">Mixed residential + commercial</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={project?.status ?? "planning"}>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
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
