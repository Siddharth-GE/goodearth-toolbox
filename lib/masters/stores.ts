import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export type StoreRow = {
  id: string;
  name: string;
  project_id: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
};

// fetchAll for consistency with the other masters reads: every list
// here promises completeness, so none of them get to silently cap.
export async function listStores(): Promise<StoreRow[]> {
  const supabase = await createClient();
  const { data, error } = await fetchAll((from, to) =>
    supabase.from("stores").select("*").order("name").order("id").range(from, to),
  );
  if (error) console.error("listStores failed:", error);
  return (data ?? []) as StoreRow[];
}
