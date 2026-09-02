import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";

/**
 * Shared "ids → display names" lookups.
 *
 * Five tools each carried their own copy of a profile-name lookup, and
 * two carried their own copy of a master-table-name lookup. `profiles`
 * and the masters tables are shared surfaces already — read directly by
 * every tool under its own grant, never through another tool's gated
 * queries module — so the lookups that turn their ids into names belong
 * here beside them, not duplicated per tool.
 */

type Client = SupabaseClient<Database>;

/**
 * Profile ids to display names, in one query, skipping the nulls.
 *
 * A missing name is cosmetic — the page still opens, the byline just
 * shows a dash — so a failed read logs and answers empty rather than
 * failing the page.
 */
export async function profileNames(
  supabase: Client,
  ids: (string | null | undefined)[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((id): id is string => id != null))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  if (error) {
    console.error("profileNames failed:", error);
    return new Map();
  }
  return new Map((data ?? []).map((profile) => [profile.id, profile.full_name]));
}

/** name-by-id for any master table with an `id` and a `name`. */
export async function labelsById(
  supabase: Client,
  table: "stores" | "plots" | "units" | "projects" | "vendors",
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id != null))];
  if (unique.length === 0) return new Map();
  const data = await fetchAll((from, to) =>
    supabase.from(table).select("id, name").in("id", unique).order("id").range(from, to),
  );
  return new Map(data.map((row) => [row.id, row.name]));
}
