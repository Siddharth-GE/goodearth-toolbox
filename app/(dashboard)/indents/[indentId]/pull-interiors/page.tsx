import { LinkButton } from "@/components/ui/button";
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
import { formatDate } from "@/lib/format";
import { getBudgetPull, getIndent, listApprovedBudgetsForProject } from "@/lib/indents/queries";
import { canEditIndent } from "@/lib/indents/workflow";
import { Palette } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PullBasket } from "../_components/pull-basket";

/**
 * The interiors path: request the items on an APPROVED budget.
 *
 * Everything on this screen comes through the approved_* views, so the
 * quantities and vendors are visible and the cost, margin and client
 * rate are not merely hidden — they were never selected.
 */
export default async function InteriorsPullPage({
  params,
  searchParams,
}: {
  params: Promise<{ indentId: string }>;
  searchParams: Promise<{ budget?: string }>;
}) {
  const { indentId } = await params;
  const { budget: budgetId } = await searchParams;

  const indent = await getIndent(indentId);
  if (!indent) notFound();
  if (!canEditIndent(indent.status)) redirect(`/indents/${indentId}`);

  // Step two: a budget is chosen, so show its lines.
  if (budgetId) {
    const pull = await getBudgetPull(budgetId, indentId);
    if (!pull) notFound();

    return (
      <div className="space-y-4">
        <PageTitle
          title={`${pull.unit_name} · R${pull.revision_no}`}
          backHref={`/indents/${indentId}/pull-interiors`}
          backLabel="Choose another budget"
          description="Approved quantities, space by space. No costs or rates appear here — this tool never receives them."
        />
        {pull.spaces.length === 0 ? (
          <EmptyState
            icon={Palette}
            title="This budget has no lines"
            description="Nothing was priced on it."
            action={<LinkButton href={`/indents/${indentId}`}>Back to the indent</LinkButton>}
          />
        ) : (
          <PullBasket
            indentId={indentId}
            reference={indent.reference}
            groups={pull.spaces.map((space) => ({ label: space.space_label, lines: space.lines }))}
            groupNoun="space"
            source="interiors"
            budgetId={pull.budget_id}
            showVendor
          />
        )}
      </div>
    );
  }

  // Step one: which approved budget?
  const budgets = await listApprovedBudgetsForProject(indent.project_id);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Pull from an interiors budget"
        backHref={`/indents/${indentId}`}
        backLabel={indent.reference}
        description={`Approved budgets on ${indent.project_name}. Only approved ones can be requested against.`}
      />

      {budgets.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No approved budgets on this project"
          description="A budget has to be priced and approved under Budgets before its items can be requested."
          action={<LinkButton href={`/indents/${indentId}`}>Back to the indent</LinkButton>}
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Unit</TableHeaderCell>
              <TableHeaderCell>Revision</TableHeaderCell>
              <TableHeaderCell>Approved</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {budgets.map((budget) => (
              <TableRow key={budget.budget_id}>
                <TableCell className="text-foreground font-medium">{budget.unit_name}</TableCell>
                <TableCell>
                  R{budget.revision_no}
                  {budget.version > 1 && <span className="text-muted ml-1">v{budget.version}</span>}
                </TableCell>
                <TableCell className="text-muted">{formatDate(budget.approved_at)}</TableCell>
                <TableCell>
                  <Link
                    href={`/indents/${indentId}/pull-interiors?budget=${budget.budget_id}`}
                    className="text-accent text-sm font-medium hover:underline"
                  >
                    Choose
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
