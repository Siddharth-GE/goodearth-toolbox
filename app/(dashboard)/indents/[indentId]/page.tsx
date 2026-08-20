import { Attribution } from "@/components/ui/attribution";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getIndent, isCurrentUserApprover } from "@/lib/indents/queries";
import { canEditIndent } from "@/lib/indents/workflow";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { listWorkCategories, listWorkItems } from "@/lib/masters/works";
import { notFound } from "next/navigation";
import { IndentStatusBadge } from "../_components/status-badge";
import { ActionButtons } from "./_components/action-buttons";
import { HeaderFields } from "./_components/header-fields";
import { LineGrid } from "./_components/line-grid";

export default async function IndentPage({ params }: { params: Promise<{ indentId: string }> }) {
  const { indentId } = await params;
  const [indent, decider, categories, brands, workItems, workCategories] = await Promise.all([
    getIndent(indentId),
    isCurrentUserApprover(),
    listItemCategories(),
    listBrands(),
    listWorkItems(),
    listWorkCategories(),
  ]);
  if (!indent) notFound();

  const editable = canEditIndent(indent.status);
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
            <IndentStatusBadge status={indent.status} />
            <ActionButtons
              indentId={indent.id}
              status={indent.status}
              lineCount={indent.line_count}
              decider={decider}
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
            {decider.isAdmin || decider.isApprover
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
            . This indent is final — purchase orders are raised from it.
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
      />
    </div>
  );
}
