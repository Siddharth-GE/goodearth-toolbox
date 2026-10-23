import { PageTitle } from "@/components/ui/page-title";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { DeleteOrCancel } from "@/components/ui/delete-or-cancel";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteBudget } from "@/lib/budgets/actions";
import { getBudget, listVendorOptions } from "@/lib/budgets/queries";
import { FileDown, Lock, PackageOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { ReopenButton } from "../_components/approve-button";
import { PricingGrid } from "../_components/pricing-grid";
import { formatDate } from "@/lib/format";

export default async function BudgetPricingPage({
  params,
}: {
  params: Promise<{ budgetId: string }>;
}) {
  const { budgetId } = await params;

  const [budget, vendors] = await Promise.all([getBudget(budgetId), listVendorOptions()]);
  if (!budget) notFound();

  const editable = budget.status === "pricing";

  return (
    <div className="space-y-4">
      <PageTitle
        title={
          <>
            {budget.unit_name} · R{budget.revision_no}
            {budget.version > 1 && (
              <span className="text-muted ml-1.5 font-medium">v{budget.version}</span>
            )}
          </>
        }
        backHref="/budgets/interiors"
        backLabel="All budgets"
        description={
          <>
            {budget.project_name} · {budget.totals.lineCount}{" "}
            {budget.totals.lineCount === 1 ? "line" : "lines"} across {budget.spaces.length}{" "}
            {budget.spaces.length === 1 ? "space" : "spaces"}
          </>
        }
        actions={
          <>
            {editable ? (
              <Badge variant="warning">Pricing</Badge>
            ) : (
              <Badge variant="success">Approved</Badge>
            )}
            {budget.spaces.length > 0 && (
              <>
                {/* Plain link: next/link would prefetch on hover and render a whole PDF. */}
                <LinkButton href={`/budgets/${budgetId}/pdf`} variant="secondary" plain>
                  <Lock className="size-4" />
                  Budget sheet
                </LinkButton>
                <LinkButton href={`/budgets/${budgetId}/quote`} variant="secondary" plain>
                  <FileDown className="size-4" />
                  Client quote
                </LinkButton>
              </>
            )}
            {!editable && <ReopenButton budgetId={budgetId} />}
            {/* A re-opened budget was approved once, so indents may rest on it: approved again, never deleted. */}
            <DeleteOrCancel
              noun="budget"
              removal={editable && budget.version === 1 ? { kind: "delete" } : null}
              deleteNote="It has never been approved, so nothing rests on it. Its pricing goes for good; the revision can be priced afresh."
              onDelete={deleteBudget.bind(null, budgetId)}
            />
          </>
        }
      />

      {budget.needsReviewCount > 0 && (
        <div className="border-warning/40 bg-warning/5 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            <span className="font-medium">
              {budget.needsReviewCount}{" "}
              {budget.needsReviewCount === 1 ? "line needs" : "lines need"} a check
            </span>{" "}
            — priced in the previous revision, but the designer has changed the quantity since. The
            unit cost has been kept; the new quantity is already in.
          </p>
        </div>
      )}

      {budget.spaces.length > 0 && (
        // Said plainly on screen: one file is a quote, the other would leak the margin.
        <p className="text-muted text-xs">
          <span className="text-foreground font-medium">Budget sheet</span> is internal — it shows
          cost and margin. <span className="text-foreground font-medium">Client quote</span> shows
          only the client price, with the design views.
        </p>
      )}

      {!editable && (
        <div className="border-border bg-surface rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Approved{" "}
            {budget.approved_at && (
              <span className="text-muted">on {formatDate(budget.approved_at)}</span>
            )}
            . Prices are locked — re-open it to correct one.
          </p>
          <p className="text-muted mt-1 text-xs">
            Documents from this budget are stamped{" "}
            <span className="text-foreground font-medium">
              R{budget.revision_no}-v{budget.version}
            </span>
            . Re-opening starts v{budget.version + 1}, so a corrected quotation is never confused
            with the one already sent.
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
