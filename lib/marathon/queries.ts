import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function getMarathonHome() {
  const supabase = createAdminClient();

  const [{ data: config }, { data: runs }, { data: groups }, { data: agents }, { count: totalEntries }] =
    await Promise.all([
      supabase.from("marathon_config").select("event_name").single(),
      supabase.from("marathon_runs").select("id, name").order("sort_order"),
      supabase.from("marathon_groups").select("id"),
      supabase.from("marathon_agents").select("id, name").order("name"),
      supabase.from("marathon_entries").select("id", { count: "exact", head: true }),
    ]);

  const runCounts = await Promise.all(
    (runs ?? []).map(async (run) => {
      const { count } = await supabase
        .from("marathon_entries")
        .select("id", { count: "exact", head: true })
        .eq("run_id", run.id);
      return { runId: run.id as string, name: run.name as string, count: count ?? 0 };
    }),
  );

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
};

export async function getAgentEntries(agentId: string, runId?: string) {
  const supabase = createAdminClient();

  let query = supabase
    .from("marathon_entries")
    .select("bib, name, created_at, marathon_categories(name, color), marathon_runs(id, name)")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (runId) query = query.eq("run_id", runId);

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
    categories: categories ?? [],
  };
}
