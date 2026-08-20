import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { getIndentHeader } from "@/lib/indents/queries";
import { Calculator } from "lucide-react";
import { notFound } from "next/navigation";

/**
 * Retired 2026-08-20 — the founder's backbone decision: the Estimator
 * IS the construction line, so construction requests pull from the
 * villa's official estimate instead of the stage-wise plan. The route
 * stays as a pointer because site phones have it bookmarked; historic
 * construction-anchored lines render on their indents unchanged.
 */
export default async function ConstructionPullPage({
  params,
}: {
  params: Promise<{ indentId: string }>;
}) {
  const { indentId } = await params;
  const indent = await getIndentHeader(indentId);
  if (!indent) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Pull from the construction plan"
        backHref={`/indents/${indentId}`}
        backLabel={indent.reference}
      />
      <EmptyState
        icon={Calculator}
        title="Construction requests now pull from the villa's official estimate"
        description="The stage-wise construction plan no longer feeds indents. Pull from the estimate instead — and if the villa has no official estimate yet, submit one in the Estimator first."
        action={
          <LinkButton href={`/indents/${indentId}/pull-estimate`}>
            Pull from the estimate
          </LinkButton>
        }
      />
    </div>
  );
}
