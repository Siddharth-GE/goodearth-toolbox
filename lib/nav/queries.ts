import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { NO_ARRANGEMENT, type ToolArrangement } from "./arrange";

/**
 * The teams and which tool sits under each (0114). Readable by every
 * signed-in person — the sidebar is everyone's — so no app gate: a
 * heading is not a secret, and what a person can open is still
 * visibleTools()'s answer, never this one.
 *
 * THROWS on a failed read. Settings → Teams uses this form: an empty
 * answer there would look like "no teams yet" and invite duplicates.
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

/**
 * The same, for the shell: a failed read must not take every page down
 * with it (the layout calls this on every request), so it is logged and
 * the sidebar falls back to one list under Other — every tool still
 * reachable, only the headings missing.
 */
export const getToolArrangement = cache(async (): Promise<ToolArrangement> => {
  try {
    return await readToolArrangement();
  } catch (error) {
    // Next's own signals (a page that needs the request, a redirect) are
    // thrown too, and must reach Next — only a failed read is ours.
    unstable_rethrow(error);
    console.error("getToolArrangement failed — the sidebar shows one list:", error);
    return NO_ARRANGEMENT;
  }
});
