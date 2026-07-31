import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { listProjects, type ProjectStatus, type ProjectType } from "@/lib/masters/projects";
import { Boxes } from "lucide-react";
import { ProjectFormDialog } from "./_components/project-form-dialog";

const TYPE_LABELS: Record<ProjectType, string> = {
  apartment_villa_community: "Apartment / villa community",
  eco_village: "Eco-village (plots + villas)",
  mixed_residential_commercial: "Mixed residential + commercial",
};

const STATUS_VARIANT: Record<ProjectStatus, "info" | "success" | "default"> = {
  planning: "info",
  active: "success",
  completed: "default",
};

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ProjectFormDialog />
      </div>

      {projects.length === 0 ? (
        <EmptyState icon={Boxes} title="No projects yet" description="Create the first project to get started." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Location</TableHeaderCell>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium text-foreground">{project.name}</TableCell>
                <TableCell>{project.location || "—"}</TableCell>
                <TableCell>{TYPE_LABELS[project.project_type]}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[project.status]} className="capitalize">
                    {project.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ProjectFormDialog project={project} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
