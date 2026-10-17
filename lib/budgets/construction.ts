import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/** Separate from queries.ts on purpose: construction plans share only the tool and the /budgets grant, and touch NO MONEY (nothing across the 0011 boundary). */

export type ConstructionPlanListRow = {
  id: string;
  unit_name: string;
  project_name: string;
  stage_count: number;
  line_count: number;
  updated_at: string;
};

export async function listConstructionPlans(): Promise<ConstructionPlanListRow[]> {
  await requireTool("/budgets");
  const supabase = await createClient();

  // Both reads go to completion: a truncated read would show a plan with fewer stages. The lines read is scoped to the listed plans.
  const plans = await fetchAll((from, to) =>
    supabase
      .from("construction_budgets")
      .select("id, updated_at, units(name), projects(name)")
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const planIds = plans.map((plan) => plan.id);
  const lines = planIds.length
    ? await fetchAll((from, to) =>
        supabase
          .from("construction_budget_lines")
          .select("budget_id, stage")
          .in("budget_id", planIds)
          .order("id")
          .range(from, to),
      )
    : [];

  const stages = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  for (const line of lines) {
    const set = stages.get(line.budget_id) ?? new Set<string>();
    set.add(line.stage);
    stages.set(line.budget_id, set);
    counts.set(line.budget_id, (counts.get(line.budget_id) ?? 0) + 1);
  }

  return plans.map((plan) => ({
    id: plan.id,
    unit_name: (plan.units as { name: string } | null)?.name ?? "—",
    project_name: (plan.projects as { name: string } | null)?.name ?? "—",
    stage_count: stages.get(plan.id)?.size ?? 0,
    line_count: counts.get(plan.id) ?? 0,
    updated_at: plan.updated_at,
  }));
}

export type ConstructionLineRow = {
  id: string;
  stage: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  quantity: number;
  uom: string;
  note: string | null;
};

export type ConstructionStageGroup = {
  stage: string;
  lines: ConstructionLineRow[];
};

export type ConstructionPlanDetail = {
  id: string;
  unit_id: string;
  unit_name: string;
  project_name: string;
  updated_at: string;
  /** Stages in creation order, not alphabetical: construction order is the point. */
  stages: ConstructionStageGroup[];
  line_count: number;
};

export const getConstructionPlan = cache(
  async (planId: string): Promise<ConstructionPlanDetail | null> => {
    await requireTool("/budgets");
    const supabase = await createClient();

    const [{ data: plan }, lines] = await Promise.all([
      supabase
        .from("construction_budgets")
        .select("id, unit_id, updated_at, units(name), projects(name)")
        .eq("id", planId)
        .maybeSingle(),
      fetchAll((from, to) =>
        supabase
          .from("construction_budget_lines")
          .select(
            "id, stage, item_id, quantity, uom, note, created_at, items(name, code, thumb_url, brands(name))",
          )
          .eq("budget_id", planId)
          .order("created_at")
          .order("id")
          .range(from, to),
      ),
    ]);

    if (!plan) return null;

    const groups = new Map<string, ConstructionLineRow[]>();
    for (const line of lines) {
      const item = line.items as {
        name: string;
        code: string | null;
        thumb_url: string | null;
        brands: { name: string } | null;
      } | null;
      const row: ConstructionLineRow = {
        id: line.id,
        stage: line.stage,
        item_id: line.item_id,
        item_name: item?.name ?? "—",
        item_code: item?.code ?? null,
        item_brand: item?.brands?.name ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        quantity: line.quantity,
        uom: line.uom,
        note: line.note,
      };
      const group = groups.get(line.stage) ?? [];
      group.push(row);
      groups.set(line.stage, group);
    }

    return {
      id: plan.id,
      unit_id: plan.unit_id,
      unit_name: (plan.units as { name: string } | null)?.name ?? "—",
      project_name: (plan.projects as { name: string } | null)?.name ?? "—",
      updated_at: plan.updated_at,
      stages: [...groups.entries()].map(([stage, stageLines]) => ({ stage, lines: stageLines })),
      line_count: lines.length,
    };
  },
);

export type StartableUnit = {
  id: string;
  name: string;
  project_name: string;
};

export async function listStartableUnits(): Promise<StartableUnit[]> {
  await requireTool("/budgets");
  const supabase = await createClient();

  const [units, projects, plans] = await Promise.all([
    listUnits(),
    listProjects(),
    fetchAll((from, to) =>
      supabase.from("construction_budgets").select("unit_id").order("unit_id").range(from, to),
    ),
  ]);

  const planned = new Set(plans.map((plan) => plan.unit_id));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  return units
    .filter((unit) => !planned.has(unit.id))
    .map((unit) => ({
      id: unit.id,
      name: unit.name,
      project_name: projectNames.get(unit.project_id) ?? "—",
    }))
    .sort((a, b) => a.project_name.localeCompare(b.project_name) || a.name.localeCompare(b.name));
}
