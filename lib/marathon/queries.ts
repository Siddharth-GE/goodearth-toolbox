import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Service-role client: the kiosk has no Supabase user (its own PIN login), so RLS cannot scope it; each function does.
export async function getMarathonHome() {
  const supabase = createAdminClient();

  // Counts come from marathon_run_counts() (0072): one GROUP BY, not row fetches that stop at PostgREST's 1,000-row
  // ceiling. A run with no entries still comes back, at zero.
  const [
    { data: config },
    { data: counts, error: countsError },
    { count: groupCount },
    { data: agents },
    { count: totalEntries },
  ] = await Promise.all([
    supabase.from("marathon_config").select("event_name").single(),
    supabase.rpc("marathon_run_counts"),
    // A head-count, not the rows: fetching them would stop at the 1,000-row ceiling.
    supabase.from("marathon_groups").select("id", { count: "exact", head: true }),
    supabase.from("marathon_agents").select("id, name").order("name"),
    supabase.from("marathon_entries").select("id", { count: "exact", head: true }),
  ]);

  // Checked: a failed read would otherwise show every run at zero.
  if (countsError) {
    throw new Error(`Could not count the entries per run: ${countsError.message}`);
  }
  const runCounts = (counts ?? []).map((row) => ({
    runId: row.run_id,
    name: row.run_name,
    count: Number(row.entry_count),
  }));

  return {
    eventName: config?.event_name ?? "Marathon",
    totalEntries: totalEntries ?? 0,
    groupCount: groupCount ?? 0,
    runCounts,
    agents: agents ?? [],
  };
}

/** Most entry rows a list shows: explicit, below PostgREST's 1,000-row ceiling. Screens report the true total beside it. */
export const MARATHON_LIST_LIMIT = 500;

export type SavedEntry = {
  bib: string;
  name: string;
  tee_size: string;
  marathon_categories: { name: string; color: string } | null;
  marathon_runs: { name: string } | null;
};

export async function getSavedEntry(bib: string, agentId: string): Promise<SavedEntry | null> {
  const supabase = createAdminClient();

  // Scoped to the calling agent: bib comes from a URL on the service-role client, so without this any agent could
  // read any runner by walking bib numbers. Embeds are single objects, but untyped supabase-js infers arrays.
  const { data, error } = await supabase
    .from("marathon_entries")
    .select("bib, name, tee_size, marathon_categories(name, color), marathon_runs(name)")
    .eq("bib", bib)
    .eq("agent_id", agentId)
    .single();
  if (error) console.error("getSavedEntry failed:", error);

  return data as unknown as SavedEntry | null;
}

export type AgentEntry = {
  bib: string;
  name: string;
  created_at: string;
  marathon_categories: { name: string; color: string } | null;
  marathon_runs: { id: string; name: string } | null;
  marathon_groups: { name: string } | null;
};

export type AgentEntryFilters = { runId?: string; groupId?: string; categoryId?: string };

export async function getAgentEntries(agentId: string, filters: AgentEntryFilters = {}) {
  const supabase = createAdminClient();

  let query = supabase
    .from("marathon_entries")
    .select(
      "bib, name, created_at, marathon_categories(name, color), marathon_runs(id, name), marathon_groups(name)",
    )
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (filters.runId) query = query.eq("run_id", filters.runId);
  if (filters.groupId) query = query.eq("group_id", filters.groupId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);

  const [{ data: entries }, { count: totalCount }] = await Promise.all([
    query.limit(MARATHON_LIST_LIMIT),
    supabase
      .from("marathon_entries")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId),
  ]);

  const rows = (entries ?? []) as unknown as AgentEntry[];
  return {
    entries: rows,
    totalCount: totalCount ?? 0,
    truncated: rows.length === MARATHON_LIST_LIMIT,
  };
}

export type AdminEntry = {
  bib: string;
  name: string;
  created_at: string;
  marathon_categories: { name: string; color: string } | null;
  marathon_runs: { id: string; name: string } | null;
  marathon_groups: { name: string } | null;
  marathon_agents: { name: string } | null;
};

export type AdminEntryFilters = {
  runId?: string;
  groupId?: string;
  categoryId?: string;
  agentId?: string;
};

export async function getAdminEntries(filters: AdminEntryFilters = {}) {
  const supabase = createAdminClient();

  // On both the row and count queries, so "500 of 1,240 matching" is true.
  const applyFilters = <T extends { eq: (column: string, value: string) => T }>(query: T) => {
    let filtered = query;
    if (filters.runId) filtered = filtered.eq("run_id", filters.runId);
    if (filters.groupId) filtered = filtered.eq("group_id", filters.groupId);
    if (filters.categoryId) filtered = filtered.eq("category_id", filters.categoryId);
    if (filters.agentId) filtered = filtered.eq("agent_id", filters.agentId);
    return filtered;
  };

  const [{ data: entries }, { count: matchingCount }, { count: grandTotal }] = await Promise.all([
    applyFilters(
      supabase
        .from("marathon_entries")
        .select(
          "bib, name, created_at, marathon_categories(name, color), marathon_runs(id, name), marathon_groups(name), marathon_agents(name)",
        )
        .order("created_at", { ascending: false }),
    ).limit(MARATHON_LIST_LIMIT),
    applyFilters(supabase.from("marathon_entries").select("id", { count: "exact", head: true })),
    supabase.from("marathon_entries").select("id", { count: "exact", head: true }),
  ]);

  const rows = (entries ?? []) as unknown as AdminEntry[];
  return {
    entries: rows,
    // The true matching count; rows.length is only what fitted on the page.
    matchingCount: matchingCount ?? 0,
    grandTotal: grandTotal ?? 0,
    truncated: rows.length === MARATHON_LIST_LIMIT,
  };
}

export async function getAdminAgents() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("marathon_agents").select("id, name").order("name");
  if (error) console.error("getAdminAgents failed:", error);
  return data ?? [];
}

export async function getAdminGroups() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("marathon_groups").select("id, name").order("name");
  if (error) console.error("getAdminGroups failed:", error);
  return data ?? [];
}

export type EntryFormCategory = {
  id: string;
  run_id: string;
  name: string;
  gender: "male" | "female" | null;
  min_age: number | null;
  max_age: number | null;
  bib_prefix: string;
  color: string;
};

export async function getEntryFormData() {
  const supabase = createAdminClient();

  const [{ data: groups }, { data: runs }, { data: categories }] = await Promise.all([
    supabase.from("marathon_groups").select("id, name").order("name"),
    supabase.from("marathon_runs").select("id, name, distance_km").order("sort_order"),
    supabase
      .from("marathon_categories")
      .select("id, run_id, name, gender, min_age, max_age, bib_prefix, color"),
  ]);

  return {
    groups: groups ?? [],
    runs: runs ?? [],
    // gender is free text behind a DB check, so generated types widen it; narrowed once here.
    categories: (categories ?? []) as unknown as EntryFormCategory[],
  };
}
