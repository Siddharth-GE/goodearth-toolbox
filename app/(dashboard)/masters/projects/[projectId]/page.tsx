import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { hasApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { formatCount, formatDate } from "@/lib/format";
import type { PlotStatus } from "@/lib/masters/plots";
import { getProjectDetail } from "@/lib/masters/project-detail";
import type { UnitStatus } from "@/lib/masters/units";
import { Boxes } from "lucide-react";
import { notFound } from "next/navigation";
import { ProjectFormDialog } from "../_components/project-form-dialog";

const STATUS_VARIANT: Record<PlotStatus | UnitStatus, "info" | "warning" | "success"> = {
  available: "info",
  reserved: "warning",
  sold: "success",
};

const PROJECT_STATUS_VARIANT: Record<string, "info" | "success" | "neutral"> = {
  planning: "neutral",
  active: "info",
  completed: "success",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const [user, { projectId }] = await Promise.all([requireUser(), params]);
  // approved_budgets is RLS-gated to /budgets|/indents — without one of
  // those grants the budget column is omitted, not shown misleadingly empty.
  const includeBudgets = (await hasApp(user, "/budgets")) || (await hasApp(user, "/indents"));
  const detail = await getProjectDetail(projectId, { includeBudgets });
  if (!detail) notFound();
  const { project, updatedByName, plots, plotTotal, units, unitTotal, counts } = detail;

  return (
    <div className="space-y-4">
      <PageTitle
        title={project.name}
        backHref="/masters/projects"
        backLabel="All projects"
        description={[project.code, project.location, project.project_type.replace(/_/g, " ")]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Badge
              variant={PROJECT_STATUS_VARIANT[project.status] ?? "neutral"}
              className="capitalize"
            >
              {project.status}
            </Badge>
            <ProjectFormDialog project={project} />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Indents</p>
          <p className="text-foreground mt-1 text-2xl font-bold">{formatCount(counts.indents)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            Purchase orders
          </p>
          <p className="text-foreground mt-1 text-2xl font-bold">{formatCount(counts.pos)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Bills</p>
          <p className="text-foreground mt-1 text-2xl font-bold">{formatCount(counts.bills)}</p>
        </Card>
      </div>

      <Card className="space-y-3 p-4">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">
          Units{unitTotal > 0 && ` — ${units.length} of ${unitTotal}`}
        </p>
        {units.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No units yet"
            description="Create units for this project from the Units tab."
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Unit</TableHeaderCell>
                <TableHeaderCell>Client</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Selection</TableHeaderCell>
                {includeBudgets && <TableHeaderCell>Budget</TableHeaderCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {units.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell className="text-foreground font-medium">
                    {unit.name}
                    {unit.code && (
                      <span className="text-muted ml-2 font-mono text-xs">{unit.code}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {unit.clientName ?? <span className="text-muted">unassigned</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[unit.status]} className="capitalize">
                      {unit.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {unit.issuedRevision != null ? (
                      `R${unit.issuedRevision}`
                    ) : (
                      <span className="text-muted">none issued</span>
                    )}
                  </TableCell>
                  {includeBudgets && (
                    <TableCell>
                      {unit.budgetApproved ? (
                        <Badge variant="success">Approved</Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">
          Plots{plotTotal > 0 && ` — ${plots.length} of ${plotTotal}`}
        </p>
        {plots.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No plots yet"
            description="Create plots for this project from the Plots tab."
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Plot</TableHeaderCell>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Unit</TableHeaderCell>
                <TableHeaderCell>Area</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plots.map((plot) => (
                <TableRow key={plot.id}>
                  <TableCell className="text-foreground font-medium">{plot.name}</TableCell>
                  <TableCell className="font-mono text-xs">{plot.code ?? "—"}</TableCell>
                  <TableCell>
                    {plot.unitName ?? <span className="text-muted">no unit yet</span>}
                  </TableCell>
                  <TableCell>{plot.area ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[plot.status]} className="capitalize">
                      {plot.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="text-muted text-xs">
        Created {formatDate(project.created_at)}
        {project.updated_at && (
          <>
            {" · last edited "}
            {formatDate(project.updated_at)}
            {updatedByName ? ` by ${updatedByName}` : ""}
          </>
        )}
      </p>
    </div>
  );
}
