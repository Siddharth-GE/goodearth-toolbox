import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import type { MaterialDef } from "./calc";

/**
 * Shared constants, helpers and reads used by more than one band of the
 * Estimator — split across mixes-actions.ts, works-actions.ts,
 * estimate-actions.ts, mixes-queries.ts, works-queries.ts and
 * estimate-queries.ts. Anything used by only one of those stayed there
 * instead of moving here.
 */

export const GRANT = "/estimator";
export const NAME_LIMIT = 120;
export const UOM_LIMIT = 20;
export const TEXT_LIMIT = 2000;

export const fail = (context: string, error: { message: string }): never =>
  readFailed("estimator", context, error);

// Units of measure moved to Masters on 2026-08-20 (0082): one list for
// the whole toolbox, managed at /masters/uoms. The 0075 private master
// (estimator_uoms) is retired in place — the table stays, nothing
// reads it, and this tool's pickers read the shared list.

/** Active unit names in picker order — since 0082 the ONE Masters list,
 * not the tool's own (estimator_uoms is retired in place; the table
 * stays, nothing reads it). Managing the list lives in Masters. */
export async function listUomNames(): Promise<string[]> {
  await requireTool(GRANT);
  return listActiveUomNames();
}

/** A master item wearing its material hat: the rate is Masters'
 * indicative price, the unit is how stock moves. Since 0086 (founder:
 * "materials are exactly the same as in the items master") this is the
 * whole material vocabulary — there is no separate list to maintain. */
export type MaterialItemRow = {
  id: string;
  name: string;
  uom: string;
  /** items.indicative_price — null = nobody has priced it in Masters. */
  rate: number | null;
  isActive: boolean;
};

export async function listMaterialItems(): Promise<MaterialItemRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const rows = await fetchAll<{
    id: string;
    name: string;
    default_uom: string;
    indicative_price: number | null;
    is_active: boolean;
  }>((from, to) =>
    supabase
      .from("items")
      .select("id, name, default_uom, indicative_price, is_active")
      .eq("kind", "material")
      .order("name")
      .order("id")
      .range(from, to),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    uom: row.default_uom,
    rate: row.indicative_price,
    isActive: row.is_active,
  }));
}

/** MaterialDefs for exactly the referenced items — the recipe book and
 * the mix/work screens resolve components through this. */
export async function itemDefsByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, MaterialDef>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, default_uom, indicative_price")
    .in("id", ids);
  if (error) fail("the materials", error);
  return new Map(
    (data ?? []).map((row) => [
      row.id,
      { id: row.id, name: row.name, uom: row.default_uom, rate: row.indicative_price },
    ]),
  );
}

export type RawMaterial = { id: string; name: string; uom: string; rate: number | null };

/** The retired estimator_materials list — kept only to resolve pre-0086
 * rows in mixes, work recipes and the global recipe book. */
export async function listMaterialsRaw(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<RawMaterial[]> {
  return fetchAll<RawMaterial>((from, to) =>
    supabase
      .from("estimator_materials")
      .select("id, name, uom, rate")
      .order("name")
      .order("id")
      .range(from, to),
  );
}
