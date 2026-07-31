import { Select } from "@/components/ui/select";
import type { ProjectRow } from "@/lib/masters/projects";
import type { SelectHTMLAttributes } from "react";

export function ProjectPicker({
  projects,
  placeholder = "Select a project",
  ...props
}: { projects: ProjectRow[]; placeholder?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select {...props}>
      <option value="">{placeholder}</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </Select>
  );
}
