import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getEstimatePull, getIndentHeader } from "@/lib/indents/queries";
import { canEditIndent } from "@/lib/indents/workflow";
import { Calculator } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstimatePullBasket } from "../_components/estimate-pull-basket";

/**
 * Pull path 3: request materials off the villa's OFFICIAL estimate —
 * the 0077 submit snapshot, read through the money-free
 * estimate_takeoff_facts window, one row per catalogue item. An indent
 * raised for a work sees that work's materials; `?all=1` shows every
 * work. Quantities come from the estimate and stay editable; nothing is
 * added until Add is pressed.
 */
export default async function EstimatePullPage({
  params,
  searchParams,
}: {
  params: Promise<{ indentId: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { indentId } = await params;
  const { all } = await searchParams;
  const indent = await getIndentHeader(indentId);
  if (!indent) notFound();
  if (!canEditIndent(indent.status)) redirect(`/indents/${indentId}`);

  const allWorks = all === "1";
  const pull = indent.unit_id
    ? await getEstimatePull(indent.unit_id, indentId, indent.work_item_id, allWorks)
    : null;
  const href = `/indents/${indentId}/pull-estimate`;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Pull from the estimate"
        backHref={`/indents/${indentId}`}
        backLabel={indent.reference}
        description={
          pull
            ? `${pull.unit_name} · ${pull.work ? pull.work.label : "every work"}. Quantities stay editable; nothing is added until you press Add.`
            : undefined
        }
      />

      {!indent.unit_id ? (
        <EmptyState
          icon={Calculator}
          title="This indent has no unit"
          description="An estimate belongs to a villa. Set one on the indent first, then come back."
          action={<LinkButton href={`/indents/${indentId}`}>Back to the indent</LinkButton>}
        />
      ) : !pull ? (
        <EmptyState
          icon={Calculator}
          title="No materials on an official estimate for this villa"
          description="Either the villa has no official estimate yet, or its official estimate lists no materials. In the Estimator, give each work its materials (Works), measure the villa, and press Make official. Until then, add items directly instead."
          action={<LinkButton href={`/indents/${indentId}`}>Back to the indent</LinkButton>}
        />
      ) : (
        <>
          {/* Which estimate this is, always — a QS's later changes to the
              working estimate reach here only once made official again. */}
          <p className="text-muted text-sm">
            From <span className="text-foreground font-medium">{pull.reference}</span>
            {pull.submitted_at && <>, made official {formatDate(pull.submitted_at)}</>}. Changes the
            QS makes after that show here only once they make the estimate official again.
          </p>

          {pull.work
            ? pull.other_work_material_count > 0 && (
                <p className="text-muted text-sm">
                  Showing {pull.work.label} only.{" "}
                  <Link href={`${href}?all=1`} className="text-accent font-medium hover:underline">
                    Show every work on this villa
                  </Link>{" "}
                  ({pull.other_work_material_count} more{" "}
                  {pull.other_work_material_count === 1 ? "material" : "materials"})
                </p>
              )
            : pull.indent_work && (
                <p className="text-muted text-sm">
                  Showing every work.{" "}
                  <Link href={href} className="text-accent font-medium hover:underline">
                    Back to {pull.indent_work.label} only
                  </Link>
                </p>
              )}

          {pull.unlinked_count > 0 && (
            <p className="text-warning text-sm">
              {pull.unlinked_count === 1
                ? "1 material of the estimate is not linked to a catalogue item"
                : `${pull.unlinked_count} materials of the estimate are not linked to catalogue items`}{" "}
              — this estimate is from before materials were items, so those can&apos;t be requested
              here. A newer official estimate from the Estimator will list them.
            </p>
          )}

          {pull.rows.length === 0 ? (
            <EmptyState
              icon={Calculator}
              title={`The official estimate has no materials for ${pull.work?.label ?? "this work"}`}
              description="The QS adds a work's materials in Estimator → Works, then makes the villa's estimate official again."
              action={
                <LinkButton href={`${href}?all=1`} variant="secondary">
                  Show every work on this villa
                </LinkButton>
              }
            />
          ) : (
            <EstimatePullBasket
              indentId={indentId}
              estimateId={pull.estimate_id}
              reference={indent.reference}
              rows={pull.rows}
            />
          )}
        </>
      )}
    </div>
  );
}
