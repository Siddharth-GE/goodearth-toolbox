import "server-only";

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import type { AccessAuditRow } from "./history";

// Settings is admin-only: every read guards itself rather than relying on the page's check.
async function requireAdminCaller() {
  const user = await requireUser();
  await requireAdmin(user);
}

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  team: string | null;
  is_active: boolean;
  role_id: string | null;
};

export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  await requireAdminCaller();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) console.error("listUsersForAdmin failed:", error);
  return data ?? [];
}

// Read to completion: users × tools can pass PostgREST's silent 1,000-row cap, and a truncated read shows real grants as unticked.
// Indent approvers (admins always may); read to completion, since a truncated read shows a real approver as unticked.
export async function listIndentApprovers(): Promise<Set<string>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("indent_approvers").select("user_id").order("user_id").range(from, to),
  );
  return new Set(data.map((row) => row.user_id));
}

export async function listBillApprovers(): Promise<Set<string>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("bill_approvers").select("user_id").order("user_id").range(from, to),
  );
  return new Set(data.map((row) => row.user_id));
}

/** Absent means not an approver; present with null means an approver with no limit. The screens rely on that distinction. */
export async function listBillApprovalLimits(): Promise<Map<string, number | null>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("bill_approvers")
      .select("user_id, approval_limit")
      .order("user_id")
      .range(from, to),
  );
  return new Map(data.map((row) => [row.user_id, row.approval_limit]));
}

export async function getPersonForAdmin(userId: string): Promise<AdminUserRow | null> {
  await requireAdminCaller();
  const users = await listUsersForAdmin();
  return users.find((row) => row.id === userId) ?? null;
}

export async function listGrantsForUser(userId: string): Promise<Set<string>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("user_apps").select("app").eq("user_id", userId).order("app").range(from, to),
  );
  return new Set(data.map((row) => row.app));
}

export async function listLeadsForUser(userId: string): Promise<Set<string>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const { data, error } = await supabase.from("tool_leads").select("app").eq("user_id", userId);
  // A failed read would show a real lead as unticked, and an admin would "fix" it wrongly.
  if (error) {
    console.error("listLeadsForUser failed:", error);
    throw new Error("Could not load who leads which app.", { cause: error });
  }
  return new Set((data ?? []).map((row) => row.app));
}

const HISTORY_LIMIT = 50;

/** Newest first, matched on the row's own payload (user_apps rows carry `user_id`, profiles rows `id`). Coverage starts
 * where the triggers do (0018); the approver lists aren't audited yet, and the screen says so. */
export async function listAccessHistory(userId: string): Promise<AccessAuditRow[]> {
  await requireAdminCaller();
  const supabase = await createClient();

  const [appsRes, leadsRes, profileRes] = await Promise.all([
    supabase
      .from("audit_log")
      .select("table_name, action, at, actor, old_data, new_data")
      .eq("table_name", "user_apps")
      .or(`new_data->>user_id.eq.${userId},old_data->>user_id.eq.${userId}`)
      .order("at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("audit_log")
      .select("table_name, action, at, actor, old_data, new_data")
      .eq("table_name", "tool_leads")
      .or(`new_data->>user_id.eq.${userId},old_data->>user_id.eq.${userId}`)
      .order("at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("audit_log")
      .select("table_name, action, at, actor, old_data, new_data")
      .eq("table_name", "profiles")
      .eq("row_id", userId)
      .order("at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  assertRead("Settings", "the access history", appsRes.error);
  assertRead("Settings", "the team lead history", leadsRes.error);
  assertRead("Settings", "the role history", profileRes.error);
  const rows = [...(appsRes.data ?? []), ...(leadsRes.data ?? []), ...(profileRes.data ?? [])].sort(
    (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0),
  );

  // One lookup for every actor, since the audit table has no FK for a join.
  const actorIds = [...new Set(rows.map((row) => row.actor).filter((id): id is string => !!id))];
  const actorNames = new Map<string, string>();
  if (actorIds.length) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    if (error) console.error("listAccessHistory actor names failed:", error);
    for (const person of data ?? []) {
      if (person.full_name) actorNames.set(person.id, person.full_name);
    }
  }

  return rows.slice(0, HISTORY_LIMIT).map((row) => ({
    table_name: row.table_name,
    action: row.action,
    at: row.at,
    actorName: row.actor ? (actorNames.get(row.actor) ?? null) : null,
    old_data: (row.old_data ?? null) as Record<string, unknown> | null,
    new_data: (row.new_data ?? null) as Record<string, unknown> | null,
  }));
}

export async function listAllGrants(): Promise<Map<string, Set<string>>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("user_apps").select("user_id, app").order("user_id").order("app").range(from, to),
  );

  const grants = new Map<string, Set<string>>();
  for (const row of data) {
    const apps = grants.get(row.user_id) ?? new Set<string>();
    apps.add(row.app);
    grants.set(row.user_id, apps);
  }
  return grants;
}
