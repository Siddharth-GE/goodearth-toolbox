import { Attribution } from "@/components/ui/attribution";
import { LinkButton } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getIndent, isCurrentUserApprover } from "@/lib/indents/queries";
import { approvalBlocker, canEditIndent, estimatorHold, stillToBuy } from "@/lib/indents/workflow";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { listWorkCategories, listWorkItems } from "@/lib/masters/works";
import { Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { IndentStatusBadge } from "../_components/status-badge";
import { ActionButtons } from "./_components/action-buttons";
import { HeaderFields } from "./_components/header-fields";
import { LineGrid } from "./_components/line-grid";

export default async function IndentPage({ params }: { params: Promise<{ indentId: string }> }) {
  const { indentId } = await params;
  const [indent, decider, categories, brands, workItems, workCategories, uoms] = await Promise.all([
    getIndent(indentId),
    isCurrentUserApprover(),
    listItemCategories(),
    listBrands(),
    listWorkItems(),
    listWorkCategories(),
    listActiveUomNames(),
  ]);
  if (!indent) notFound();

  const editable = canEditIndent(indent.status);
  const linesToBuy = indent.lines.filter(
    (line) => stillToBuy(line.quantity, line.ordered_quantity) > 0,
  ).length;
  // Lines outside the estimate wait for the estimator (0113). Read fresh
  // on every load — the estimator answers from another screen.
  const hold = estimatorHold(
    indent.lines.map((line) => ({
      source: line.source,
      off_estimate_reason: line.off_estimate_reason,
      estimator_decision: line.estimator?.decision ?? null,
    })),
  );
  const blocker = approvalBlocker(hold);
  const categoryNameById = new Map(workCategories.map((c) => [c.id, c.name]));
  const works = workItems
    .filter((work) => work.is_active)
    .map((work) => ({
      id: work.id,
      code: work.code,
      name: work.name,
      category: categoryNameById.get(work.category_id) ?? "Other",
    }));

  return (
    <div className="space-y-4">
      <PageTitle
        title={indent.reference}
        backHref="/indents/list"
        backLabel="All indents"
        description={
          <>
            {indent.project_name}
            {indent.plot_name && ` · ${indent.plot_name}`}
            {indent.unit_name && ` · ${indent.unit_name}`}
          </>
        }
        actions={
          <>
            <LinkButton href={`/indents/${indent.id}/pdf`} variant="secondary" size="sm" plain>
              <Printer className="size-4" />
              Print
            </LinkButton>
            <IndentStatusBadge status={indent.status} />
            <ActionButtons
              indentId={indent.id}
              status={indent.status}
              lineCount={indent.line_count}
              decider={decider}
              approvalBlocker={blocker}
            />
          </>
        }
      />

      {/* A rejection sends the indent back to draft with the reason —
          front and centre, so fixing it doesn't start with hunting. */}
      {editable && indent.rejection_note && (
        <div className="border-warning/40 bg-warning/5 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            <span className="font-medium">Sent back:</span> {indent.rejection_note}
          </p>
          <p className="text-muted mt-1 text-xs">Fix what&apos;s needed and submit again.</p>
        </div>
      )}

      {indent.status === "submitted" && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Submitted{" "}
            {indent.submitted_at && (
              <span className="text-muted">on {formatDate(indent.submitted_at)}</span>
            )}{" "}
            —{" "}
            {hold.refused > 0
              ? `the estimator refused ${hold.refused} ${hold.refused === 1 ? "line" : "lines"} outside the estimate. ${decider.isAdmin || decider.isApprover ? "Send it back with a note so the site team can change them." : "It goes back to the site team to change."}`
              : hold.waiting > 0
                ? `waiting for the estimator on ${hold.waiting} ${hold.waiting === 1 ? "line" : "lines"} outside the estimate, then for an approver. Nothing can be changed while it waits.`
                : decider.isAdmin || decider.isApprover
                  ? "yours to decide. Approve it, or send it back with a note."
                  : "waiting for an approver. Nothing can be changed while it waits."}
          </p>
          <Attribution name={indent.submitted_by_name} label="Submitted by" />
        </div>
      )}

      {indent.status === "approved" && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Approved{" "}
            {indent.approved_at && (
              <span className="text-muted">on {formatDate(indent.approved_at)}</span>
            )}
            . This indent is final — purchase orders are raised from it.{" "}
            {linesToBuy === 0 ? (
              <span className="text-success font-medium">Everything on it has been ordered.</span>
            ) : (
              <span className="font-medium">
                {linesToBuy} of {indent.line_count} {indent.line_count === 1 ? "line" : "lines"}{" "}
                still to buy.
              </span>
            )}
          </p>
          <Attribution name={indent.approved_by_name} label="Approved by" />
        </div>
      )}

      <HeaderFields
        indentId={indent.id}
        stage={indent.stage}
        workItemId={indent.work_item_id}
        works={works}
        requiredBy={indent.required_by}
        note={indent.note}
        editable={editable}
      />

      <LineGrid
        indentId={indent.id}
        reference={indent.reference}
        lines={indent.lines}
        editable={editable}
        hasUnit={indent.unit_id != null}
        showOrdered={indent.status === "approved"}
        categories={categories.map(({ id, name }) => ({ id, name }))}
        brands={brands.map(({ id, name }) => ({ id, name }))}
        uoms={uoms}
      />
    </div>
  );
}
