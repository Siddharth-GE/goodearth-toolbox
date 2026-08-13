import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import { parsePlanInputs, SCENARIOS, type PlanInputs } from "./inputs";
import { runScenario } from "./model";

/**
 * Reads for Business Planning.
 *
 * Every function here opens with `requireTool("/business-planning")` —
 * the RLS policies in 0048 gate SELECT as well as writes, so an
 * ungranted user would get an empty list rather than an error, which
 * reads as "no plans yet" instead of "not for you". The explicit check
 * redirects them instead of lying.
 *
 * This module reads NOTHING outside its own table except `profiles`,
 * which is shared. That is the founder's "keep this app simple and
 * independent completely", honoured literally.
 */

export type PlanSummaryRow = {
  id: string;
  name: string;
  location: string | null;
  lineCount: number;
  /** The ACTIVE scenario's headline figures, from the same engine the
      editor uses — so the list and the plan can never disagree. */
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

/**
 * Every plan, newest touch first.
 *
 * fetchAll rather than a plain select: this is the only way to reach a
 * plan, so a silent 1,000-row cap would one day hide one. Plans are
 * counted in dozens, so this is one page in practice.
 */
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

  const names = await lookupNames(rows.map((row) => row.updated_by));

  return rows.map((row) => {
    const inputs = parsePlanInputs(row.inputs);
    // The engine is pure, so it runs here as happily as it does in the
    // browser — and running it is the only way the figure on this list
    // and the figure inside the plan cannot drift apart. Plans are
    // counted in dozens; this is microseconds.
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
 * One plan, parsed. `cache()` because the page and its metadata both
 * want it and neither should pay for the round trip twice.
 *
 * Returns null for "no such plan" AND for "not visible to you" — RLS
 * makes those indistinguishable here, and both end at notFound(), which
 * is the right answer to either.
 */
export const getPlan = cache(async (planId: string): Promise<PlanDetail | null> => {
  await requireTool("/business-planning");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_plans")
    .select("id, name, location, project_id, inputs, updated_at, updated_by")
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    console.error("getPlan failed:", error);
    return null;
  }
  if (!data) return null;

  const names = await lookupNames([data.updated_by]);

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

/** Profile ids to display names, in one query, skipping the nulls. */
async function lookupNames(ids: (string | null)[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((id): id is string => id != null))];
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  if (error) {
    // A missing name is cosmetic — the plan still opens, the byline just
    // shows a dash. Not worth failing a page over.
    console.error("lookupNames failed:", error);
    return new Map();
  }
  return new Map((data ?? []).map((profile) => [profile.id, profile.full_name]));
}
