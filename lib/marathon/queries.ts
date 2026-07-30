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
