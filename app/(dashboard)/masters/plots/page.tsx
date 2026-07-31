import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { listPlots, type PlotStatus } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { Boxes } from "lucide-react";
import { PlotFormDialog } from "./_components/plot-form-dialog";

const STATUS_VARIANT: Record<PlotStatus, "info" | "warning" | "success"> = {
  available: "info",
  reserved: "warning",
  sold: "success",
};

export default async function PlotsPage() {
  const [plots, projects] = await Promise.all([listPlots(), listProjects()]);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PlotFormDialog projects={projects} />
      </div>

      {plots.length === 0 ? (
        <EmptyState icon={Boxes} title="No plots yet" description="Create the first plot under a project." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name / number</TableHeaderCell>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Area</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {plots.map((plot) => (
              <TableRow key={plot.id}>
                <TableCell className="font-medium text-foreground">{plot.name}</TableCell>
                <TableCell>{projectName(plot.project_id)}</TableCell>
                <TableCell>{plot.area ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[plot.status]} className="capitalize">
                    {plot.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <PlotFormDialog projects={projects} plot={plot} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
