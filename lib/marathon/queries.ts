import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function getMarathonHome() {
  const supabase = createAdminClient();

  // Every run's entry count comes from marathon_run_counts() (0072) —
  // Postgres does the GROUP BY, in one query, and the run's name comes
  // back with it, so there is no separate marathon_runs read any more.
  //
  // This used to be one exact count per run inside a .map, and that was
  // already the careful version: the one before it fetched every entry row
  // and called .length, which on race day would have frozen the per-run
  // breakdown at PostgREST's 1,000-row ceiling while the total beside it
  // kept climbing — two numbers on the same screen contradicting each
  // other, on the only day this screen matters. PostgREST cannot express a
  // GROUP BY, so doing it properly needed a database function.
  //
  // A run with no entries still comes back, at zero: the kiosk lists the
  // runs, and a missing row would read as a missing run, not an empty one.
  const [
    { data: config },
    { data: counts, error: countsError },
    { count: groupCount },
    { data: agents },
    { count: totalEntries },
  ] = await Promise.all([
    supabase.from("marathon_config").select("event_name").single(),
    supabase.rpc("marathon_run_counts"),
    // A head-count, not the rows. Fetching every group just to read
    // .length would silently stop at PostgREST's 1000-row ceiling.
    supabase.from("marathon_groups").select("id", { count: "exact", head: true }),
    supabase.from("marathon_agents").select("id, name").order("name"),
    supabase.from("marathon_entries").select("id", { count: "exact", head: true }),
  ]);

  // Checked, not shrugged at. A failed read here would otherwise render
  // every run at zero entries, which on race day is a lie that looks
  // exactly like a quiet morning.
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

/**
 * How many entry rows a list screen will show at most.
 *
 * Deliberately explicit and below PostgREST's implicit 1000-row ceiling,
 * so the limit is a decision this code made rather than one the transport
 * imposed silently. Screens report the true total alongside, and say so
 * when they're showing a subset — a number that quietly stops counting is
 * worse than a smaller number labelled honestly.
 */
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

  // Scoped to the calling agent: bib arrives from a URL param on the
  // service-role client, so without this filter any signed-in agent
  // could read any runner's entry by walking bib numbers.
  //
  // The DB returns single objects here (each entry has exactly one
  // category and one run), but supabase-js can't infer that without
  // generated types and defaults to typing embeds as arrays.
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

  // Applied to both the row query and the count query, so "showing 500 of
  // 1,240 matching" is always true rather than "500 of everything".
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
    // The real number of entries matching the filter, which is what the
    // screen's headline should report — rows.length is only how many
    // fitted on the page.
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
    // gender is a free-text column with a DB check constraint, not a
    // real Postgres enum, so generated types widen it to `string | null`
    // — narrowed back here to match the DB's actual constraint, once,
    // rather than in every component that consumes this data.
    categories: (categories ?? []) as unknown as EntryFormCategory[],
  };
}
