import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { getEstimatePull, getIndentHeader } from "@/lib/indents/queries";
import { canEditIndent } from "@/lib/indents/workflow";
import { Calculator } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { EstimatePullBasket } from "../_components/estimate-pull-basket";

/**
 * Pull path 3: request materials off the villa's OFFICIAL estimate —
 * the 0077 submit snapshot, read through the money-free
 * estimate_takeoff_facts window. Quantities come from the estimate and
 * stay editable; nothing is added until Add is pressed.
 */
export default async function EstimatePullPage({
  params,
}: {
  params: Promise<{ indentId: string }>;
}) {
  const { indentId } = await params;
  const indent = await getIndentHeader(indentId);
  if (!indent) notFound();
  if (!canEditIndent(indent.status)) redirect(`/indents/${indentId}`);

  const pull = indent.unit_id ? await getEstimatePull(indent.unit_id, indentId) : null;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Pull from the estimate"
        backHref={`/indents/${indentId}`}
        backLabel={indent.reference}
        description={
          pull
            ? `${pull.unit_name} · ${pull.reference} — the official estimate's materials, added up across its works. Quantities stay editable; nothing is added until you press Add.`
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
          title="No official estimate for this villa"
          description="An estimate becomes official when it is submitted in the Estimator. Until then, add items directly instead."
          action={<LinkButton href={`/indents/${indentId}`}>Back to the indent</LinkButton>}
        />
      ) : (
        <>
          {pull.unlinked_count > 0 && (
            <p className="text-warning text-sm">
              {pull.unlinked_count === 1
                ? "1 material of the estimate is not linked to a catalogue item"
                : `${pull.unlinked_count} materials of the estimate are not linked to catalogue items`}{" "}
              — those can&apos;t be requested until the link is set on the Estimator&apos;s
              Materials screen.
            </p>
          )}
          <EstimatePullBasket
            indentId={indentId}
            estimateId={pull.estimate_id}
            reference={indent.reference}
            rows={pull.rows}
          />
        </>
      )}
    </div>
  );
}
