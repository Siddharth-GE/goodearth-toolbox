import "server-only";

import { createClient } from "@/lib/supabase/server";

export type BrandRow = {
  id: string;
  name: string;
  created_at: string;
};

export async function listBrands(): Promise<BrandRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("*").order("name");
  return (data ?? []) as BrandRow[];
}
