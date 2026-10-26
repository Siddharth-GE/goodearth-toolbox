import "server-only";

import { hasApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import {
  listWorkCategories,
  listWorkGroups,
  listWorkItems,
  workCategoryLabel,
} from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { budgetReport, type BudgetReport } from "./budget-vs-actual";

/** Budget against actual (0136) is the one Estimator page /bills also opens: villa_cost_facts admits /estimator, /bills and
 * /reporter in its own WHERE, by the founder's decision 2026-10-22. Everything else here stays /estimator only. */

const fail = (context: string, error: { message: string }): never =>
  readFailed("estimator", context, error);

export async function requireBudgetReader() {
  const user = await requireUser();
  if (!(await hasApp(user, "/estimator")) && !(await hasApp(user, "/bills"))) redirect("/");
  return { user, isEstimator: await hasApp(user, "/estimator") };
}

export type VillaBudget = {
  unitId: string;
  villaName: string;
  plotName: string | null;
  projectName: string | null;
  /** Only an Estimator holder reads the estimate itself; for Bills this stays null. */
  official: { id: string; reference: string | null; submittedAt: string | null } | null;
  report: BudgetReport;
};

export async function getVillaBudget(unitId: string): Promise<VillaBudget | null> {
  const { isEstimator } = await requireBudgetReader();
  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id, name, plot_id, project_id")
    .eq("id", unitId)
    .maybeSingle();
  if (unitError) fail("the villa", unitError);
  if (!unit) return null;

  // units has two paths to plots, so no embed (BUGCATCHER #2).
  const [
    { data: plot, error: plotError },
    { data: project, error: projectError },
    official,
    facts,
    works,
    categories,
    groups,
  ] = await Promise.all([
    supabase.from("plots").select("name").eq("id", unit.plot_id).maybeSingle(),
    supabase.from("projects").select("name").eq("id", unit.project_id).maybeSingle(),
    isEstimator
      ? supabase
          .from("estimator_estimates")
          .select("id, reference, submitted_at")
          .eq("unit_id", unitId)
          .eq("status", "submitted")
          .eq("is_template", false)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    fetchAll((from, to) =>
      supabase
        .from("villa_cost_facts")
        .select("work_item_id, work_group_id, kind, amount, unpriced")
        .eq("unit_id", unitId)
        .order("work_item_id")
        .order("kind")
        .range(from, to),
    ),
    listWorkItems(),
    listWorkCategories(),
    listWorkGroups(),
  ]);
  if (plotError) fail("the villa's plot", plotError);
  if (projectError) fail("the villa's project", projectError);
  if (official.error) fail("the official estimate", official.error);

  // A purchase for a stage indent (0158) names its stage, not a work: it shows as the whole stage, under its category.
  const report = budgetReport(
    facts.map((row) => ({
      workItemId: row.work_item_id ?? (row.work_group_id ? `stage:${row.work_group_id}` : null),
      kind: row.kind ?? "",
      amount: row.amount ?? 0,
      unpriced: row.unpriced ?? false,
    })),
    new Map([
      ...works.map(
        (work) =>
          [
            work.id,
            {
              label: `${work.code} — ${work.name}`,
              categoryId: work.category_id,
              sortOrder: work.sort_order,
            },
          ] as const,
      ),
      ...groups.map(
        (group) =>
          [
            `stage:${group.id}`,
            {
              label: `${group.code} — ${group.name} (the whole stage)`,
              categoryId: group.category_id,
              sortOrder: Number.MAX_SAFE_INTEGER - 1,
            },
          ] as const,
      ),
    ]),
    new Map(
      categories.map((category) => [
        category.id,
        { label: workCategoryLabel(category), sortOrder: category.sort_order },
      ]),
    ),
  );

  return {
    unitId,
    villaName: unit.name,
    plotName: plot?.name ?? null,
    projectName: project?.name ?? null,
    official: official.data
      ? {
          id: official.data.id,
          reference: official.data.reference,
          submittedAt: official.data.submitted_at,
        }
      : null,
    report,
  };
}
