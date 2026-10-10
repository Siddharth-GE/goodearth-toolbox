"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { CompanyRow } from "@/lib/masters/companies";
import { createProject, updateProject } from "@/lib/masters/projects-actions";
import type { ProjectRow } from "@/lib/masters/projects";

export function ProjectFormDialog({
  project,
  companies,
}: {
  project?: ProjectRow;
  companies: CompanyRow[];
}) {
  const isEdit = !!project;
  // Active companies, plus the project's own if it has since been
  // switched off — the form must not silently drop it on save.
  const choices = companies.filter(
    (company) => company.is_active || company.id === project?.company_id,
  );

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
        <Label htmlFor="company_id">Company</Label>
        <Select id="company_id" name="company_id" defaultValue={project?.company_id ?? ""}>
          <option value="">No company yet</option>
          {choices.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
              {company.is_active ? "" : " (inactive)"}
            </option>
          ))}
        </Select>
        <p className="text-muted text-xs">
          Every indent, PO, work order and bill on this project prints this company at the top.
          Companies are added under Masters → Companies.
        </p>
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
