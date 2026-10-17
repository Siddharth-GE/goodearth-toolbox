import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/** Stages are picked, never typed. Deactivating stops new picks without touching history; the database refuses deleting one in use. */
export type ConstructionStageRow = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export async function listConstructionStages(): Promise<ConstructionStageRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("construction_stages")
      .select("id, name, sort_order, is_active, created_at")
      .order("sort_order")
      .order("name")
      .order("id")
      .range(from, to),
  );
  return data as ConstructionStageRow[];
}

export async function listActiveStageNames(): Promise<string[]> {
  const stages = await listConstructionStages();
  return stages.filter((stage) => stage.is_active).map((stage) => stage.name);
}
