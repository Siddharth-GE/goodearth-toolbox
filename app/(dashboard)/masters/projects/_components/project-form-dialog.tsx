"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createProject, updateProject } from "@/lib/masters/projects-actions";
import type { ProjectRow } from "@/lib/masters/projects";

export function ProjectFormDialog({ project }: { project?: ProjectRow }) {
  const isEdit = !!project;

  return (
    <RecordFormDialog
      label="Project"
      isEdit={isEdit}
      action={isEdit ? updateProject.bind(null, project.id) : createProject}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={project?.name} required autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          defaultValue={project?.code ?? ""}
          autoComplete="off"
          placeholder="ASHRAM"
          maxLength={10}
        />
        <p className="text-muted text-xs">
          Short code used in indent numbers, e.g. ASHRAM → IND/ASHRAM/001. Needed before indents can
          be raised on this project.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          defaultValue={project?.location ?? ""}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project_type">Project type</Label>
        <Select
          id="project_type"
          name="project_type"
          defaultValue={project?.project_type ?? ""}
          required
        >
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
    </RecordFormDialog>
  );
}
