import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";

/** Ids to display names for profiles and master tables: shared surfaces every tool reads under its own grant. */

type Client = SupabaseClient<Database>;

/** A missing name is cosmetic, so a failed read logs and answers empty rather than failing the page. */
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
