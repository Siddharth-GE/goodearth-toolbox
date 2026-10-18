import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import type { MaterialDef } from "./calc";

export const GRANT = "/estimator";
export { NAME_LIMIT, TEXT_LIMIT, UOM_LIMIT } from "./limits";

export const fail = (context: string, error: { message: string }): never =>
  readFailed("estimator", context, error);

/** Active unit names in picker order: the ONE Masters list (0082). */
export async function listUomNames(): Promise<string[]> {
  await requireTool(GRANT);
  return listActiveUomNames();
}

/** A master item wearing its material hat (0086): the rate is its indicative price, the unit is how stock moves. */
export type MaterialItemRow = {
  id: string;
  name: string;
  uom: string;
  /** items.indicative_price; null = unpriced in Masters. */
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

/** A pre-0086 recipe row names a retired estimator_materials row and no item. It counts for nothing and shows under this label with a Remove button. */
export const OLDER_ROW_LABEL = "An older material row — no longer counted";
