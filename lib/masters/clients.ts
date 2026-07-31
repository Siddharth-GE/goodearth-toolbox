import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ClientRow = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
};

export async function listClients(): Promise<ClientRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").order("name");
  return (data ?? []) as ClientRow[];
}
