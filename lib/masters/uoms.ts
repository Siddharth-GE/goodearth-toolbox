import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * The managed list of units of measure (migration 0082) — ONE list for
 * every unit picker in the toolbox. Founder decision, 2026-08-20:
 * procurement's hard-coded eight and the Estimator's own picker master
 * were two vocabularies for the same idea, and "keep it in the
 * masters" ended that. Same rules as construction stages (0053):
 * picked, never typed; renames cascade to every row carrying the unit;
 * deactivating stops new picks without touching history; a unit in use
 * cannot be deleted.
 */
export type UomMasterRow = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export async function listUomsMaster(): Promise<UomMasterRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("uoms")
      .select("id, name, sort_order, is_active, created_at")
      .order("sort_order")
      .order("name")
      .order("id")
      .range(from, to),
  );
  return data as UomMasterRow[];
}

/** Only the units a new row may pick today, in picker order. */
export async function listActiveUomNames(): Promise<string[]> {
  const uoms = await listUomsMaster();
  return uoms.filter((uom) => uom.is_active).map((uom) => uom.name);
}

/** Server-side guard for actions saving a typed/picked unit: the master
 * list is the truth, the way isUom's hard-coded eight used to be. */
export async function isActiveUom(name: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uoms")
    .select("id")
    .eq("name", name)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.error("isActiveUom failed:", error);
    return false;
  }
  return data != null;
}
