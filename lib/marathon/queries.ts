import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function getMarathonHome() {
  const supabase = createAdminClient();

  const [{ data: config }, { data: runs }, { data: groups }, { data: agents }, { count: totalEntries }, { data: entryRunIds }] =
    await Promise.all([
      supabase.from("marathon_config").select("event_name").single(),
      supabase.from("marathon_runs").select("id, name").order("sort_order"),
      supabase.from("marathon_groups").select("id"),
      supabase.from("marathon_agents").select("id, name").order("name"),
      supabase.from("marathon_entries").select("id", { count: "exact", head: true }),
      // One row per entry (just the FK, not the whole record) — tallied
      // in JS below so this stays a single query regardless of how many
      // runs exist, instead of one count query per run.
      supabase.from("marathon_entries").select("run_id"),
    ]);

  const countByRun = new Map<string, number>();
  for (const entry of entryRunIds ?? []) {
    countByRun.set(entry.run_id, (countByRun.get(entry.run_id) ?? 0) + 1);
  }
  const runCounts = (runs ?? []).map((run) => ({
    runId: run.id as string,
    name: run.name as string,
    count: countByRun.get(run.id) ?? 0,
  }));

  return {
    eventName: config?.event_name ?? "Marathon",
    totalEntries: totalEntries ?? 0,
    groupCount: groups?.length ?? 0,
    runCounts,
    agents: agents ?? [],
  };
}

export type SavedEntry = {
  bib: string;
  name: string;
  tee_size: string;
  marathon_categories: { name: string; color: string } | null;
  marathon_runs: { name: string } | null;
};

export async function getSavedEntry(bib: string): Promise<SavedEntry | null> {
  const supabase = createAdminClient();

  // The DB returns single objects here (each entry has exactly one
  // category and one run), but supabase-js can't infer that without
  // generated types and defaults to typing embeds as arrays.
  const { data } = await supabase
    .from("marathon_entries")
    .select("bib, name, tee_size, marathon_categories(name, color), marathon_runs(name)")
    .eq("bib", bib)
    .single();

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
    query,
    supabase
      .from("marathon_entries")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId),
  ]);

  return {
    entries: (entries ?? []) as unknown as AgentEntry[],
    totalCount: totalCount ?? 0,
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

  let query = supabase
    .from("marathon_entries")
    .select(
      "bib, name, created_at, marathon_categories(name, color), marathon_runs(id, name), marathon_groups(name), marathon_agents(name)",
    )
    .order("created_at", { ascending: false });

  if (filters.runId) query = query.eq("run_id", filters.runId);
  if (filters.groupId) query = query.eq("group_id", filters.groupId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.agentId) query = query.eq("agent_id", filters.agentId);

  const [{ data: entries }, { count: grandTotal }] = await Promise.all([
    query,
    supabase.from("marathon_entries").select("id", { count: "exact", head: true }),
  ]);

  return {
    entries: (entries ?? []) as unknown as AdminEntry[],
    grandTotal: grandTotal ?? 0,
  };
}

export async function getAdminAgents() {
  const supabase = createAdminClient();
  const { data } = await supabase.from("marathon_agents").select("id, name").order("name");
  return data ?? [];
}

export async function getAdminGroups() {
  const supabase = createAdminClient();
  const { data } = await supabase.from("marathon_groups").select("id, name").order("name");
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
