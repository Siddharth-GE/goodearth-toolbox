import { Badge } from "@/components/ui/badge";
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
import {
  getContractFormOptions,
  getCurrentBillActor,
  listBillContracts,
} from "@/lib/bills/queries";
import { canApproveContract, canEditContract } from "@/lib/bills/workflow";
import { formatMoney } from "@/lib/format";
import { HardHat } from "lucide-react";
import { ContractActions } from "./_components/contract-actions";
import { ContractFormDialog } from "./_components/contract-form-dialog";

export default async function LabourContractsPage() {
  const [contracts, options, actor] = await Promise.all([
    listBillContracts(),
    // The dialog's pickers: vendors, projects, plots, units — nothing more.
    getContractFormOptions(),
    getCurrentBillActor(),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Labour Contracts"
        backHref="/bills/list"
        backLabel="All bills"
        description="A contractor's agreement — recorded here, approved by a bill approver, then billable."
        actions={
          <ContractFormDialog
            vendors={options.vendors}
            projects={options.projects}
            plots={options.plots}
            units={options.units}
          />
        }
      />

      {contracts.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No labour contracts yet"
          description="Record a contractor's agreement, get it approved, then bills can be recorded against it."
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
              <TableHeaderCell className="text-right">Billed</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {contracts.map((contract) => (
              <TableRow key={contract.id}>
                <TableCell className="text-foreground font-medium">
                  {contract.vendor_name}
                </TableCell>
                <TableCell>{contract.project_name}</TableCell>
                <TableCell>{contract.scope_name}</TableCell>
                <TableCell>{contract.description}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatMoney(contract.contract_value)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatMoney(contract.billed_total)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {contract.status === "approved" ? (
                      <Badge variant="success">Approved</Badge>
                    ) : (
                      <Badge variant="warning">Pending approval</Badge>
                    )}
                    {!contract.is_active && <Badge variant="neutral">Inactive</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    {canEditContract(contract.status) && (
                      <ContractFormDialog
                        vendors={options.vendors}
                        projects={options.projects}
                        plots={options.plots}
                        units={options.units}
                        contract={contract}
                      />
                    )}
                    <ContractActions
                      contractId={contract.id}
                      isActive={contract.is_active}
                      showApprove={canApproveContract(
                        contract.status,
                        actor,
                        contract.contract_value,
                      )}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
