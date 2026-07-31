import "server-only";

import { createClient } from "@/lib/supabase/server";

export type StoreRow = {
  id: string;
  name: string;
  project_id: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
};

export async function listStores(): Promise<StoreRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("*").order("name");
  return (data ?? []) as StoreRow[];
}
