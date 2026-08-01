import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getBudget, listVendorOptions } from "@/lib/budgets/queries";
import { PackageOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReopenButton } from "../_components/approve-button";
import { PricingGrid } from "../_components/pricing-grid";

export default async function BudgetPricingPage({
  params,
}: {
  params: Promise<{ budgetId: string }>;
}) {
  const { budgetId } = await params;

  const budget = await getBudget(budgetId);
  if (!budget) notFound();

  const vendors = await listVendorOptions();
  const editable = budget.status === "pricing";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/budgets" className="text-xs font-medium text-muted hover:text-foreground">
            ← All budgets
          </Link>
          <h1 className="mt-1 text-lg font-bold tracking-tight text-foreground">
            {budget.unit_name} · R{budget.revision_no}
          </h1>
          <p className="text-sm text-muted">
            {budget.project_name} · {budget.totals.lineCount}{" "}
            {budget.totals.lineCount === 1 ? "line" : "lines"} across {budget.spaces.length}{" "}
            {budget.spaces.length === 1 ? "space" : "spaces"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editable ? <Badge variant="warning">Pricing</Badge> : <Badge variant="success">Approved</Badge>}
          {!editable && <ReopenButton budgetId={budgetId} />}
        </div>
      </div>

      {!editable && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-sm text-foreground">
            Approved{" "}
            {budget.approved_at && (
              <span className="text-muted">
                on {new Date(budget.approved_at).toLocaleDateString("en-IN")}
              </span>
            )}
            . Prices are locked — re-open it to correct one.
          </p>
        </div>
      )}

      {budget.spaces.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Nothing to price"
          description="This revision has no items in any space."
        />
      ) : (
        <PricingGrid
          budgetId={budget.id}
          selectionId={budget.selection_id}
          spaces={budget.spaces}
          vendors={vendors}
          editable={editable}
        />
      )}
    </div>
  );
}
