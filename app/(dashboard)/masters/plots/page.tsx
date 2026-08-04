import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listPlots, type PlotStatus } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { Boxes } from "lucide-react";
import { PlotFormDialog } from "./_components/plot-form-dialog";

const STATUS_VARIANT: Record<PlotStatus, "info" | "warning" | "success"> = {
  available: "info",
  reserved: "warning",
  sold: "success",
};

export default async function PlotsPage() {
  const [plots, projects, units] = await Promise.all([listPlots(), listProjects(), listUnits()]);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";
  // Plot ↔ unit is 1:1 (0029): each plot shows its unit, or that it's
  // still waiting for one — the soft side of the rule the DB can't
  // enforce additively.
  const unitByPlot = new Map(units.map((unit) => [unit.plot_id, unit.name]));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PlotFormDialog projects={projects} />
      </div>

      {plots.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No plots yet"
          description="Create the first plot under a project."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name / number</TableHeaderCell>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell>Unit</TableHeaderCell>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Area</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {plots.map((plot) => (
              <TableRow key={plot.id}>
                <TableCell className="text-foreground font-medium">{plot.name}</TableCell>
                <TableCell className="font-mono text-xs">{plot.code ?? "—"}</TableCell>
                <TableCell>
                  {unitByPlot.get(plot.id) ?? <span className="text-muted">no unit yet</span>}
                </TableCell>
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
