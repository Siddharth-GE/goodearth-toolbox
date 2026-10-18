import "server-only";

import { requireTool } from "@/lib/auth/access";
import { profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import { parsePlanInputs, SCENARIOS, type PlanInputs } from "./inputs";
import { runScenario } from "./model";

/**
 * Every function opens with requireTool: the 0048 policies gate SELECT too, so an ungranted
 * user would get an empty list instead of a redirect. Reads nothing outside its own table
 * except `profiles`.
 */

export type PlanSummaryRow = {
  id: string;
  name: string;
  location: string | null;
  lineCount: number;
  /** The ACTIVE scenario's headline figures, from the same engine the editor uses. */
  scenarioName: string;
  revenue: number;
  pbt: number;
  marginPct: number | null;
  peakFunding: number;
  updated_at: string;
  updated_by_name: string | null;
};

export type PlanDetail = {
  id: string;
  name: string;
  location: string | null;
  /** Set = this plan's headline numbers are published as targets (0057). */
  project_id: string | null;
  inputs: PlanInputs;
  updated_at: string;
  updated_by_name: string | null;
};

/** Every plan, newest touch first. fetchAll, since a silent 1,000-row cap would one day hide a plan. */
export async function listPlans(): Promise<PlanSummaryRow[]> {
  await requireTool("/business-planning");
  const supabase = await createClient();

  const rows = await fetchAll((from, to) =>
    supabase
      .from("business_plans")
      .select("id, name, location, inputs, updated_at, updated_by")
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const names = await profileNames(
    supabase,
    rows.map((row) => row.updated_by),
  );

  return rows.map((row) => {
    const inputs = parsePlanInputs(row.inputs);
    // The engine is pure, so running it here keeps the list figures identical to the plan's.
    const active = runScenario(inputs, inputs.activeScenario);
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      lineCount: inputs.lines.length,
      scenarioName: SCENARIOS[inputs.activeScenario],
      revenue: active.revenue,
      pbt: active.pbt,
      marginPct: active.marginPct,
      peakFunding: active.peakFunding,
      updated_at: row.updated_at,
      updated_by_name: row.updated_by ? (names.get(row.updated_by) ?? null) : null,
    };
  });
}

/**
 * One plan, parsed. `cache()` because the page and its metadata both want it. Null for "no such
 * plan" and "not visible to you": RLS makes them indistinguishable, and both end at notFound().
 */
export const getPlan = cache(async (planId: string): Promise<PlanDetail | null> => {
  await requireTool("/business-planning");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_plans")
    .select("id, name, location, project_id, inputs, updated_at, updated_by")
    .eq("id", planId)
    .maybeSingle();

  assertRead("business-planning", "the plan", error);
  if (!data) return null;

  const names = await profileNames(supabase, [data.updated_by]);

  return {
    id: data.id,
    name: data.name,
    location: data.location,
    project_id: data.project_id,
    inputs: parsePlanInputs(data.inputs),
    updated_at: data.updated_at,
    updated_by_name: data.updated_by ? (names.get(data.updated_by) ?? null) : null,
  };
});
