import "server-only";

import { createClient } from "@/lib/supabase/server";

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  team: string | null;
};

export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_users");
  return data ?? [];
}

// Every granted (user_id, app) pair, for every user — the Settings grid
// renders this as a lookup rather than one query per row.
export async function listAllGrants(): Promise<Map<string, Set<string>>> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_apps").select("user_id, app");

  const grants = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const apps = grants.get(row.user_id) ?? new Set<string>();
    apps.add(row.app);
    grants.set(row.user_id, apps);
  }
  return grants;
}
