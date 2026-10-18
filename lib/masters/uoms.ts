import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/** One list for every unit picker. Picked, never typed; renames cascade; deactivating keeps history; a unit in use can't be deleted. */
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

export async function listActiveUomNames(): Promise<string[]> {
  const uoms = await listUomsMaster();
  return uoms.filter((uom) => uom.is_active).map((uom) => uom.name);
}

/** Server-side guard for actions saving a unit: the master list is the truth. */
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
