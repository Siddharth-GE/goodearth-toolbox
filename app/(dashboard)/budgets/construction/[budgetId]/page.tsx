import { PageTitle } from "@/components/ui/page-title";
import { getConstructionPlan } from "@/lib/budgets/construction";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { listActiveStageNames } from "@/lib/masters/stages";
import { notFound } from "next/navigation";
import { StageGrid } from "./_components/stage-grid";

export default async function ConstructionPlanPage({
  params,
}: {
  params: Promise<{ budgetId: string }>;
}) {
  const { budgetId } = await params;
  const [plan, categories, brands, stageOptions] = await Promise.all([
    getConstructionPlan(budgetId),
    listItemCategories(),
    listBrands(),
    listActiveStageNames(),
  ]);
  if (!plan) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title={`${plan.unit_name} — construction plan`}
        backHref="/budgets/construction"
        backLabel="All plans"
        description={`${plan.project_name} · materials and quantities only, stage by stage. This plan no longer feeds Indents — construction requests pull from the villa's official estimate.`}
      />

      <StageGrid
        planId={plan.id}
        stages={plan.stages}
        stageOptions={stageOptions}
        categories={categories.map(({ id, name }) => ({ id, name }))}
        brands={brands.map(({ id, name }) => ({ id, name }))}
      />
    </div>
  );
}
