import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { getConstructionPull, getIndentHeader } from "@/lib/indents/queries";
import { canEditIndent } from "@/lib/indents/workflow";
import { HardHat } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PullBasket } from "../_components/pull-basket";

/**
 * The site path: request materials straight off the unit's stage-wise
 * construction plan, stage by stage.
 */
export default async function ConstructionPullPage({
  params,
}: {
  params: Promise<{ indentId: string }>;
}) {
  const { indentId } = await params;
  // The light header read — this screen never shows the indent's lines.
  const indent = await getIndentHeader(indentId);
  if (!indent) notFound();
  // Lines can only be added to a draft — the database says so too.
  if (!canEditIndent(indent.status)) redirect(`/indents/${indentId}`);

  const pull = indent.unit_id ? await getConstructionPull(indent.unit_id, indentId) : null;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Pull from the construction plan"
        backHref={`/indents/${indentId}`}
        backLabel={indent.reference}
        description={
          pull
            ? `${pull.unit_name} · quantities come from the plan and stay editable. Nothing is added until you press Add.`
            : undefined
        }
      />

      {!indent.unit_id ? (
        <EmptyState
          icon={HardHat}
          title="This indent has no unit"
          description="A construction plan belongs to a unit. Set one on the indent first, then come back."
          action={<LinkButton href={`/indents/${indentId}`}>Back to the indent</LinkButton>}
        />
      ) : !pull ? (
        <EmptyState
          icon={HardHat}
          title="No construction plan for this unit"
          description="The QS team starts one under Budgets → Construction. Until then, add items directly instead."
          action={<LinkButton href={`/indents/${indentId}`}>Back to the indent</LinkButton>}
        />
      ) : pull.stages.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="The plan has no lines yet"
          description="Nothing has been planned for this unit's stages so far."
          action={<LinkButton href={`/indents/${indentId}`}>Back to the indent</LinkButton>}
        />
      ) : (
        <PullBasket
          indentId={indentId}
          reference={indent.reference}
          groups={pull.stages.map((stage) => ({ label: stage.stage, lines: stage.lines }))}
          groupNoun="stage"
          source="construction"
        />
      )}
    </div>
  );
}
