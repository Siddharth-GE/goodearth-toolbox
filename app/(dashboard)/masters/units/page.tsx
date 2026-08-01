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
import { listClients } from "@/lib/masters/clients";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits, type UnitStatus } from "@/lib/masters/units";
import { Boxes } from "lucide-react";
import { UnitFormDialog } from "./_components/unit-form-dialog";

const STATUS_VARIANT: Record<UnitStatus, "info" | "warning" | "success"> = {
  available: "info",
  reserved: "warning",
  sold: "success",
};

export default async function UnitsPage() {
  const [units, projects, plots, clients] = await Promise.all([
    listUnits(),
    listProjects(),
    listPlots(),
    listClients(),
  ]);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";
  const clientName = (id: string | null) =>
    id ? (clients.find((c) => c.id === id)?.name ?? "—") : "—";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <UnitFormDialog projects={projects} plots={plots} clients={clients} />
      </div>

      {units.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No units yet"
          description="Create the first unit under a project."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Client</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="text-foreground font-medium">{unit.name}</TableCell>
                <TableCell>{projectName(unit.project_id)}</TableCell>
                <TableCell className="capitalize">{unit.unit_type.replace(/_/g, " ")}</TableCell>
                <TableCell>{clientName(unit.client_id)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[unit.status]} className="capitalize">
                    {unit.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <UnitFormDialog projects={projects} plots={plots} clients={clients} unit={unit} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
