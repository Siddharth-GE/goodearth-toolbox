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
import { formatMoney } from "@/lib/format";
import { listLabourContracts } from "@/lib/masters/labour-contracts";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { listVendors } from "@/lib/masters/vendors";
import { HardHat } from "lucide-react";
import { LabourContractFormDialog } from "./_components/labour-contract-form-dialog";

export default async function LabourContractsPage() {
  const [contracts, vendors, projects, plots, units] = await Promise.all([
    listLabourContracts(),
    listVendors(),
    listProjects(),
    listPlots(),
    listUnits(),
  ]);
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? "—";
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";
  const scopeName = (plotId: string | null, unitId: string | null) => {
    if (unitId) return units.find((u) => u.id === unitId)?.name ?? "—";
    if (plotId) return plots.find((p) => p.id === plotId)?.name ?? "—";
    return "General";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <LabourContractFormDialog vendors={vendors} projects={projects} plots={plots} units={units} />
      </div>

      {contracts.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No labour contracts yet"
          description="Record a contractor's agreement so bills can be recorded against it."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Contractor</TableHeaderCell>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Plot / Unit</TableHeaderCell>
              <TableHeaderCell>Covers</TableHeaderCell>
              <TableHeaderCell className="text-right">Value</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {contracts.map((contract) => (
              <TableRow key={contract.id}>
                <TableCell className="text-foreground font-medium">
                  {vendorName(contract.vendor_id)}
                </TableCell>
                <TableCell>{projectName(contract.project_id)}</TableCell>
                <TableCell>{scopeName(contract.plot_id, contract.unit_id)}</TableCell>
                <TableCell>{contract.description}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatMoney(contract.contract_value)}
                </TableCell>
                <TableCell>
                  <Badge variant={contract.is_active ? "success" : "neutral"}>
                    {contract.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <LabourContractFormDialog
                    vendors={vendors}
                    projects={projects}
                    plots={plots}
                    units={units}
                    contract={contract}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
