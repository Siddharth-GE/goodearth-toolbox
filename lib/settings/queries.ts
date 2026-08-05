import "server-only";

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { AccessAuditRow } from "./history";

// Settings is admin-only, so every read here guards itself — the page
// checks too, but a query must not rely on its caller remembering to.
async function requireAdminCaller() {
  const user = await requireUser();
  await requireAdmin(user);
}

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  /** The admin/staff flag — a separate question from role_id (0034). */
  role: string;
  team: string | null;
  is_active: boolean;
  /** The assigned role template, or null. */
  role_id: string | null;
};

export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  await requireAdminCaller();
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_users");
  return data ?? [];
}

// Every granted (user_id, app) pair, for every user — the Settings grid
// renders this as a lookup rather than one query per row. Read to
// completion: this table is sized by users × tools (200 × 10 clears
// PostgREST's silent 1,000-row cap), and a truncated read renders real
// grants as unticked boxes — which an admin would then "fix" wrongly.
// The named list of people who may approve indents (admins always may,
// without a row here). Read to completion for the same reason as the
// grants below: a truncated read renders a real approver as unticked.
export async function listIndentApprovers(): Promise<Set<string>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) =>
    supabase.from("indent_approvers").select("user_id").order("user_id").range(from, to),
  );
  return new Set((data ?? []).map((row) => row.user_id));
}

// The bill twin of the list above (bill_approvers, migration 0025).
export async function listBillApprovers(): Promise<Set<string>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) =>
    supabase.from("bill_approvers").select("user_id").order("user_id").range(from, to),
  );
  return new Set((data ?? []).map((row) => row.user_id));
}

/**
 * Each bill approver's ceiling (0033). Absent from the map means not an
 * approver at all; present with null means an approver with no limit —
 * a distinction the screens rely on, so it isn't flattened here.
 */
export async function listBillApprovalLimits(): Promise<Map<string, number | null>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) =>
    supabase
      .from("bill_approvers")
      .select("user_id, approval_limit")
      .order("user_id")
      .range(from, to),
  );
  return new Map((data ?? []).map((row) => [row.user_id, row.approval_limit]));
}

/** One person for their own Settings page, or null if the id is unknown. */
export async function getPersonForAdmin(userId: string): Promise<AdminUserRow | null> {
  await requireAdminCaller();
  const users = await listUsersForAdmin();
  return users.find((row) => row.id === userId) ?? null;
}

/** The apps one person holds — the person page's own lookup. */
export async function listGrantsForUser(userId: string): Promise<Set<string>> {
  await requireAdminCaller();
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) =>
    supabase.from("user_apps").select("app").eq("user_id", userId).order("app").range(from, to),
  );
  return new Set((data ?? []).map((row) => row.app));
}

const HISTORY_LIMIT = 50;

/**
 * What has been done to this person's access, newest first.
 *
 * audit_log rows are matched on the row's own payload rather than a
 * column: user_apps rows carry the user in `user_id`, profiles rows in
 * `id`. Only the two tables Settings writes are read — describeAccess-
 * History (pure, tested) turns them into sentences.
 *
 * Coverage starts where the triggers do: user_apps and profiles from
 * 0018 (Aug 2026). The approver lists aren't audited yet — the screen
 * says so rather than implying nothing ever happened.
 */
export async function listAccessHistory(userId: string): Promise<AccessAuditRow[]> {
  await requireAdminCaller();
  const supabase = await createClient();

  const [appsRes, profileRes] = await Promise.all([
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
      .eq("table_name", "profiles")
      .eq("row_id", userId)
      .order("at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const rows = [...(appsRes.data ?? []), ...(profileRes.data ?? [])].sort((a, b) =>
    a.at < b.at ? 1 : a.at > b.at ? -1 : 0,
  );

  // One lookup for every actor mentioned, rather than a join the audit
  // table has no FK for.
  const actorIds = [...new Set(rows.map((row) => row.actor).filter((id): id is string => !!id))];
  const actorNames = new Map<string, string>();
  if (actorIds.length) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
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
  const { data } = await fetchAll((from, to) =>
    supabase.from("user_apps").select("user_id, app").order("user_id").order("app").range(from, to),
  );

  const grants = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const apps = grants.get(row.user_id) ?? new Set<string>();
    apps.add(row.app);
    grants.set(row.user_id, apps);
  }
  return grants;
}
