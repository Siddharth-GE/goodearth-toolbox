import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { getPlan } from "@/lib/business-planning/queries";
import { Target } from "lucide-react";
import { notFound } from "next/navigation";

export default async function PlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const plan = await getPlan(planId);
  if (!plan) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title={plan.name}
        description={plan.location ?? undefined}
        backHref="/business-planning"
        backLabel="All plans"
      />

      <EmptyState
        icon={Target}
        title="The model lands next"
        description="This plan exists and is saved. The editor — assumptions, lines, cashflow and summary — is the next piece of work."
      />
    </div>
  );
}
