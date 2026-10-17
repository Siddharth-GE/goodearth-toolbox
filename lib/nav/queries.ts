import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { NO_ARRANGEMENT, type ToolArrangement } from "./arrange";

/**
 * Teams and their tools (0114). No app gate: a heading is not a secret.
 * Throws on a failed read, so Settings → Teams never shows "no teams yet" and invites duplicates.
 */
export const readToolArrangement = cache(async (): Promise<ToolArrangement> => {
  const supabase = await createClient();
  const [teams, apps] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("tool_teams")
        .select("id, name")
        .order("sort_order")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("tool_team_apps").select("app, team_id").order("app").range(from, to),
    ),
  ]);
  return {
    teams,
    teamOf: Object.fromEntries(apps.map((row) => [row.app, row.team_id])),
  };
});

/** For the shell: a failed read is logged and the sidebar falls back to one list under Other. */
export const getToolArrangement = cache(async (): Promise<ToolArrangement> => {
  try {
    return await readToolArrangement();
  } catch (error) {
    // Next's own signals (redirects, dynamic rendering) must reach Next.
    unstable_rethrow(error);
    console.error("getToolArrangement failed — the sidebar shows one list:", error);
    return NO_ARRANGEMENT;
  }
});
