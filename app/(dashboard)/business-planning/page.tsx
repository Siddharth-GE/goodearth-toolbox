import { Attribution } from "@/components/ui/attribution";
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
import { listPlans } from "@/lib/business-planning/queries";
import { formatCrore, formatDate, formatPercent } from "@/lib/format";
import { Target } from "lucide-react";
import Link from "next/link";
import { NewPlanDialog } from "./_components/new-plan-dialog";
import { PlanRowMenu } from "./_components/plan-row-menu";

export default async function BusinessPlanningPage() {
  const plans = await listPlans();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Business Planning"
        description="Model a project before you build it. Land, product lines and overheads in, profit and funding out. Figures here are visible only to this team."
        actions={<NewPlanDialog />}
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No plans yet"
          description="A plan is a set of lines — plotted development, row houses, apartments, senior living — with the land, costs and sale velocity for each. Start one and add lines as you go."
          action={<NewPlanDialog />}
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Plan</TableHeaderCell>
              <TableHeaderCell>Lines</TableHeaderCell>
              <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
              <TableHeaderCell className="text-right">Profit</TableHeaderCell>
              <TableHeaderCell className="text-right">Margin</TableHeaderCell>
              <TableHeaderCell className="text-right">To raise</TableHeaderCell>
              <TableHeaderCell>Last edited</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>
                  <Link
                    href={`/business-planning/${plan.id}`}
                    className="text-foreground hover:text-accent font-medium"
                  >
                    {plan.name}
                  </Link>
                  {plan.location ? <div className="text-muted text-xs">{plan.location}</div> : null}
                </TableCell>
                <TableCell className="text-muted">
                  {plan.lineCount === 0 ? (
                    "None yet"
                  ) : (
                    <>
                      {plan.lineCount} {plan.lineCount === 1 ? "line" : "lines"}
                      <div className="text-muted text-xs">{plan.scenarioName}</div>
                    </>
                  )}
                </TableCell>
                {/* Figures come from the same pure engine the plan page
                    runs in the browser, so the list and the plan cannot
                    show different numbers. */}
                <TableCell className="text-right font-mono">
                  {plan.lineCount === 0 ? "—" : formatCrore(plan.revenue)}
                </TableCell>
                <TableCell className="text-foreground text-right font-mono font-medium">
                  {plan.lineCount === 0 ? "—" : formatCrore(plan.pbt)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatPercent(plan.marginPct)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {plan.lineCount === 0
                    ? "—"
                    : plan.peakFunding === 0
                      ? "nothing"
                      : formatCrore(plan.peakFunding)}
                </TableCell>
                <TableCell className="text-muted">
                  <div className="flex items-center gap-2">
                    <span>{formatDate(plan.updated_at)}</span>
                    <Attribution name={plan.updated_by_name} label="Last edited by" />
                  </div>
                </TableCell>
                <TableCell>
                  <PlanRowMenu planId={plan.id} planName={plan.name} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
