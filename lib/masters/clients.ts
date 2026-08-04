import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export type ClientRow = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
};

// fetchAll for consistency with the other masters reads: every list
// here promises completeness, so none of them get to silently cap.
export async function listClients(): Promise<ClientRow[]> {
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) =>
    supabase.from("clients").select("*").order("name").order("id").range(from, to),
  );
  return (data ?? []) as ClientRow[];
}
