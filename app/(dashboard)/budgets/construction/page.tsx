import { PageTitle } from "@/components/ui/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listConstructionPlans, listStartableUnits } from "@/lib/budgets/construction";
import { formatCount, formatDate } from "@/lib/format";
import { HardHat } from "lucide-react";
import Link from "next/link";
import { BudgetsNav } from "../_components/budgets-nav";
import { StartPlanDialog } from "./_components/start-plan-dialog";

export default async function ConstructionPlansPage() {
  const [plans, startable] = await Promise.all([listConstructionPlans(), listStartableUnits()]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Budgets"
        description="Stage-wise construction plans by unit — materials and quantities, no pricing. This plan no longer feeds Indents: since 2026-08-20 construction requests pull from the villa's official estimate in the Estimator."
        actions={<StartPlanDialog units={startable} />}
      />

      <BudgetsNav />

      {plans.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No construction plans yet"
          description="Start a plan for a unit, then build it up stage by stage — Foundation, Sill, Lintel…"
          action={<StartPlanDialog units={startable} />}
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Unit</TableHeaderCell>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Stages</TableHeaderCell>
              <TableHeaderCell>Lines</TableHeaderCell>
              <TableHeaderCell>Updated</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell className="text-foreground font-medium">{plan.unit_name}</TableCell>
                <TableCell>{plan.project_name}</TableCell>
                <TableCell>{formatCount(plan.stage_count)}</TableCell>
                <TableCell>{formatCount(plan.line_count)}</TableCell>
                <TableCell className="text-muted">{formatDate(plan.updated_at)}</TableCell>
                <TableCell>
                  <Link
                    href={`/budgets/construction/${plan.id}`}
                    className="text-accent text-sm font-medium hover:underline"
                  >
                    Open
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
