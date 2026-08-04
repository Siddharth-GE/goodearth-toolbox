import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export type BrandRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

// fetchAll for consistency with the other masters reads: every list
// here promises completeness, so none of them get to silently cap.
export async function listBrands(): Promise<BrandRow[]> {
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) =>
    supabase.from("brands").select("*").order("name").order("id").range(from, to),
  );
  return (data ?? []) as BrandRow[];
}
