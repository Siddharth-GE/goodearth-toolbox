import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the Design Management app.
 *
 * Every function opens with `requireTool("/design-management")`. What
 * this tool reads from outside itself (STATUS.md contract row): the
 * shared units/plots/projects/profiles masters, and the works
 * vocabulary (work_categories/work_groups/work_items) via
 * lib/masters/works.ts — the same vocabulary Estimator prices and
 * Supervisors logs against. Nothing here reads or shows money.
 *
 * `units` has two FK paths to `plots` (0029), and `drawing_revisions` /
 * `transmittals` carry multiple FKs to `profiles` (created_by,
 * released_by/issued_by, updated_by) — so wherever this module needs a
 * villa or a person's name it merges through a `Map` rather than an
 * embed (BUGCATCHER #2), the lib/supervisors/queries.ts pattern.
 */

const GRANT = "/design-management";

function fail(context: string, error: { message: string }): never {
  console.error(`design-management: ${context} failed:`, error);
  throw new Error(`Could not load ${context}.`);
}

// ---------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------

export async function getWelcomeCounts(): Promise<{
  activeSets: number;
  villasWithReleasedDrawings: number;
  draftRevisions: number;
  transmittalsIssued: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [sets, releasedRevisionUnits, draftRevisions, issuedTransmittals] = await Promise.all([
    supabase
      .from("drawing_sets")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    // "Villas with at least one released drawing" is a
    // COUNT(DISTINCT unit_id) — `head: true` counts rows, not distinct
    // values, so it can't express this. Reading the (single, small)
    // unit_id column to completion via fetchAll and deduping in JS is
    // the honest alternative to guessing at a cap; there is no
    // aggregate view here to lean on (this tool has none — no money,
    // no fact view).
    fetchAll<{ unit_id: string }>((from, to) =>
      supabase
        .from("drawing_revisions")
        .select("unit_id")
        .eq("status", "released")
        .order("unit_id")
        .range(from, to),
    ),
    supabase
      .from("drawing_revisions")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    supabase
      .from("transmittals")
      .select("id", { count: "exact", head: true })
      .eq("status", "issued"),
  ]);

  return {
    activeSets: sets.count ?? 0,
    villasWithReleasedDrawings: new Set(releasedRevisionUnits.map((row) => row.unit_id)).size,
    draftRevisions: draftRevisions.count ?? 0,
    transmittalsIssued: issuedTransmittals.count ?? 0,
  };
}

// ---------------------------------------------------------------------
// Drawing sets (the drawing master)
// ---------------------------------------------------------------------

export type DrawingSetRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Count of work_items this set links by default (drawing_set_works). */
  workCount: number;
};

export async function listDrawingSets(): Promise<DrawingSetRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [sets, links] = await Promise.all([
    fetchAll<{
      id: string;
      code: string | null;
      name: string;
      description: string | null;
      is_active: boolean;
      sort_order: number;
    }>((from, to) =>
      supabase
        .from("drawing_sets")
        .select("id, code, name, description, is_active, sort_order")
        .order("sort_order")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ drawing_set_id: string }>((from, to) =>
      supabase.from("drawing_set_works").select("drawing_set_id").order("id").range(from, to),
    ),
  ]);

  const workCountBySet = new Map<string, number>();
  for (const link of links) {
    workCountBySet.set(link.drawing_set_id, (workCountBySet.get(link.drawing_set_id) ?? 0) + 1);
  }

  return sets.map((set) => ({
    id: set.id,
    code: set.code,
    name: set.name,
    description: set.description,
    isActive: set.is_active,
    sortOrder: set.sort_order,
    workCount: workCountBySet.get(set.id) ?? 0,
  }));
}

export type DrawingSetDetail = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  /** work_item ids this set links by default — the checkbox tree's state. */
  workItemIds: string[];
};

export async function getDrawingSetDetail(id: string): Promise<DrawingSetDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: set, error } = await supabase
    .from("drawing_sets")
    .select("id, code, name, description, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("the drawing set", error);
  if (!set) return null;

  const links = await fetchAll<{ work_item_id: string }>((from, to) =>
    supabase
      .from("drawing_set_works")
      .select("work_item_id")
      .eq("drawing_set_id", id)
      .order("id")
      .range(from, to),
  );

  return {
    id: set.id,
    code: set.code,
    name: set.name,
    description: set.description,
    isActive: set.is_active,
    workItemIds: links.map((link) => link.work_item_id),
  };
}

// ---------------------------------------------------------------------
// Design stages
// ---------------------------------------------------------------------

export type DesignStageRow = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export async function listDesignStages(): Promise<DesignStageRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const data = await fetchAll<{
    id: string;
    name: string;
    sort_order: number;
    is_active: boolean;
  }>((from, to) =>
    supabase
      .from("design_stages")
      .select("id, name, sort_order, is_active")
      .order("sort_order")
      .order("name")
      .order("id")
      .range(from, to),
  );

  return data.map((stage) => ({
    id: stage.id,
    name: stage.name,
    sortOrder: stage.sort_order,
    isActive: stage.is_active,
  }));
}
