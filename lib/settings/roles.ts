import "server-only";

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

// Settings is admin-only, so every read guards itself — the page checks
// too, but a query must not rely on its caller remembering to.
async function requireAdminCaller() {
  const user = await requireUser();
  await requireAdmin(user);
}

export type RoleRow = {
  id: string;
  name: string;
  can_approve_indents: boolean;
  can_approve_bills: boolean;
  bill_approval_limit: number | null;
  created_at: string;
};

export type RoleWithApps = RoleRow & {
  apps: string[];
  /** How many people hold this role — what a delete would strand. */
  memberCount: number;
};

export async function listRoles(): Promise<RoleWithApps[]> {
  await requireAdminCaller();
  const supabase = await createClient();

  const [rolesRes, appsRes, membersRes] = await Promise.all([
    fetchAll((from, to) =>
      supabase.from("roles").select("*").order("name").order("id").range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("role_apps").select("role_id, app").order("role_id").range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("profiles")
        .select("role_id")
        .not("role_id", "is", null)
        .order("role_id")
        .range(from, to),
    ),
  ]);

  const appsByRole = new Map<string, string[]>();
  for (const row of appsRes.data ?? []) {
    appsByRole.set(row.role_id, [...(appsByRole.get(row.role_id) ?? []), row.app]);
  }
  const memberCounts = new Map<string, number>();
  for (const row of membersRes.data ?? []) {
    if (row.role_id) memberCounts.set(row.role_id, (memberCounts.get(row.role_id) ?? 0) + 1);
  }

  return ((rolesRes.data ?? []) as RoleRow[]).map((role) => ({
    ...role,
    apps: appsByRole.get(role.id) ?? [],
    memberCount: memberCounts.get(role.id) ?? 0,
  }));
}

/** The apps one role bundles — the person page's own lookup. */
export async function listRoleApps(roleId: string): Promise<Set<string>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) =>
    supabase.from("role_apps").select("app").eq("role_id", roleId).order("app").range(from, to),
  );
  return new Set((data ?? []).map((row) => row.app));
}

export async function getRole(roleId: string): Promise<RoleRow | null> {
  await requireAdminCaller();
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("*").eq("id", roleId).maybeSingle();
  return (data as RoleRow) ?? null;
}
