import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getIndent } from "@/lib/indents/queries";
import { canEditIndent } from "@/lib/indents/workflow";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { notFound } from "next/navigation";
import { IndentStatusBadge } from "../_components/status-badge";
import { ActionButtons } from "./_components/action-buttons";
import { HeaderFields } from "./_components/header-fields";
import { LineGrid } from "./_components/line-grid";

export default async function IndentPage({ params }: { params: Promise<{ indentId: string }> }) {
  const { indentId } = await params;
  const [indent, categories, brands] = await Promise.all([
    getIndent(indentId),
    listItemCategories(),
    listBrands(),
  ]);
  if (!indent) notFound();

  const editable = canEditIndent(indent.status);

  return (
    <div className="space-y-4">
      <PageTitle
        title={indent.reference}
        backHref="/indents"
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
        <div className="border-border bg-surface rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Submitted{" "}
            {indent.submitted_at && (
              <span className="text-muted">on {formatDate(indent.submitted_at)}</span>
            )}{" "}
            — waiting for an approver. Nothing can be changed while it waits.
          </p>
        </div>
      )}

      {indent.status === "approved" && (
        <div className="border-border bg-surface rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Approved{" "}
            {indent.approved_at && (
              <span className="text-muted">on {formatDate(indent.approved_at)}</span>
            )}
            . This indent is final — purchase orders are raised from it.
          </p>
        </div>
      )}

      <HeaderFields
        indentId={indent.id}
        stage={indent.stage}
        requiredBy={indent.required_by}
        note={indent.note}
        editable={editable}
      />

      <LineGrid
        indentId={indent.id}
        reference={indent.reference}
        lines={indent.lines}
        editable={editable}
        categories={categories.map(({ id, name }) => ({ id, name }))}
        brands={brands.map(({ id, name }) => ({ id, name }))}
      />
    </div>
  );
}
