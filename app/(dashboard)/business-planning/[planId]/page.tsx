import { Attribution } from "@/components/ui/attribution";
import { PageTitle } from "@/components/ui/page-title";
import { getPlan } from "@/lib/business-planning/queries";
import { formatDate } from "@/lib/format";
import { notFound } from "next/navigation";
import { PlanEditor } from "./_components/plan-editor";

export default async function PlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const plan = await getPlan(planId);
  // Null covers both "no such plan" and "not visible to you" — RLS makes
  // those indistinguishable, and notFound() is the right answer to each.
  if (!plan) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title={plan.name}
        description={plan.location ?? undefined}
        backHref="/business-planning"
        backLabel="All plans"
        actions={
          <div className="text-muted flex items-center gap-2 text-xs">
            <span>Edited {formatDate(plan.updated_at)}</span>
            <Attribution name={plan.updated_by_name} label="Last edited by" />
          </div>
        }
      />

      {/* The whole document goes to the client: the model recalculates as
          the founder types, which needs the inputs and the engine in the
          same place. It is a few kilobytes. */}
      <PlanEditor planId={plan.id} initial={plan.inputs} />
    </div>
  );
}
