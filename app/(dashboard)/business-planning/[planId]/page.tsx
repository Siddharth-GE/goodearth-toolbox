import { Attribution } from "@/components/ui/attribution";
import { PageTitle } from "@/components/ui/page-title";
import { getPlan } from "@/lib/business-planning/queries";
import { formatDate } from "@/lib/format";
import { listProjects } from "@/lib/masters/projects";
import { notFound } from "next/navigation";
import { PlanEditor } from "./_components/plan-editor";
import { RenamePlanDialog } from "./_components/rename-plan-dialog";

export default async function PlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  // Projects feed the optional targets link (0057), a shared master every tool may read.
  const [plan, projects] = await Promise.all([getPlan(planId), listProjects()]);
  // Null covers "no such plan" and "not visible to you": RLS makes them indistinguishable.
  if (!plan) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title={plan.name}
        description={plan.location ?? undefined}
        backHref="/business-planning/plans"
        backLabel="All plans"
        actions={
          <div className="flex items-center gap-3">
            <div className="text-muted flex items-center gap-2 text-xs">
              <span>Edited {formatDate(plan.updated_at)}</span>
              <Attribution name={plan.updated_by_name} label="Last edited by" />
            </div>
            <RenamePlanDialog
              planId={plan.id}
              name={plan.name}
              location={plan.location}
              projectId={plan.project_id}
              projects={projects.map((project) => ({ id: project.id, name: project.name }))}
            />
          </div>
        }
      />

      {/* The whole document goes to the client: the model recalculates as the founder types. */}
      <PlanEditor planId={plan.id} initial={plan.inputs} />
    </div>
  );
}
