"use server";

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { OTHER_SECTION } from "@/lib/nav/arrange";
import { createClient } from "@/lib/supabase/server";
import { TOOLS } from "@/lib/tools";
import { revalidatePath } from "next/cache";

// Type-only import, deliberately NOT re-exported — a type re-export from
// a "use server" file can survive into the runtime export list and crash
// it (the outage guarded by npm run check:actions).
import type { ActionState } from "@/lib/action-state";

/**
 * Teams — the headings in everyone's sidebar (0114, lib/nav/). Admin
 * only: the policies say is_admin(), and every action checks first.
 * Teams arrange; grants decide — nothing here changes who can open what.
 *
 * Every page carries the sidebar, so a change refreshes the whole
 * dashboard, not just Settings.
 */
function refreshEverywhere() {
  revalidatePath("/", "layout");
}

function readName(raw: FormDataEntryValue | null): { name: string } | { error: string } {
  const name = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!name) return { error: "Give the team a name, e.g. Design." };
  if (name.length > 40) return { error: "Keep the name under 40 characters." };
  if (name.toLowerCase() === OTHER_SECTION.name.toLowerCase()) {
    return { error: "“Other” is kept for tools without a team — choose another name." };
  }
  return { name };
}

export async function createTeam(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const parsed = readName(formData.get("name"));
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  // A new team goes to the bottom; the arrows move it from there.
  const { data: last, error: readError } = await supabase
    .from("tool_teams")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) {
    console.error("createTeam read failed:", readError);
    return { error: "Could not create the team. Try again." };
  }

  const { error } = await supabase.from("tool_teams").insert({
    name: parsed.name,
    sort_order: (last?.sort_order ?? 0) + 1,
    created_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "A team with that name already exists." };
    console.error("createTeam failed:", error);
    return { error: "Could not create the team. Try again." };
  }

  refreshEverywhere();
  return undefined;
}

export async function renameTeam(
  teamId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const parsed = readName(formData.get("name"));
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tool_teams")
    .update({ name: parsed.name, updated_by: user.id })
    .eq("id", teamId);
  if (error) {
    if (error.code === "23505") return { error: "A team with that name already exists." };
    console.error("renameTeam failed:", error);
    return { error: "Could not rename the team. Try again." };
  }

  refreshEverywhere();
  return undefined;
}

/**
 * One step up or down the sidebar. The whole order is renumbered 1…n as
 * it is written, so ties or gaps left by deletes never make an arrow
 * look like it did nothing.
 */
export async function moveTeam(teamId: string, direction: "up" | "down"): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  const { data: teams, error: readError } = await supabase
    .from("tool_teams")
    .select("id, sort_order")
    .order("sort_order")
    .order("name")
    .order("id");
  if (readError) {
    console.error("moveTeam read failed:", readError);
    return { error: "Could not move the team. Try again." };
  }

  const from = teams.findIndex((team) => team.id === teamId);
  if (from === -1) return { error: "That team no longer exists — refresh the page." };
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= teams.length) return undefined;

  const order = [...teams];
  [order[from], order[to]] = [order[to], order[from]];
  const writes = order
    .map((team, index) => ({ team, sortOrder: index + 1 }))
    .filter(({ team, sortOrder }) => team.sort_order !== sortOrder)
    .map(({ team, sortOrder }) =>
      supabase
        .from("tool_teams")
        .update({ sort_order: sortOrder, updated_by: user.id })
        .eq("id", team.id),
    );
  const results = await Promise.all(writes);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("moveTeam failed:", failed.error);
    return { error: "Could not move the team. Try again." };
  }

  refreshEverywhere();
  return undefined;
}

/** Its tools fall back to Other (the FK cascades their rows) — no grant is touched. */
export async function deleteTeam(teamId: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  const { error } = await supabase.from("tool_teams").delete().eq("id", teamId);
  if (error) {
    console.error("deleteTeam failed:", error);
    return { error: "Could not delete the team. Try again." };
  }

  refreshEverywhere();
  return undefined;
}

/** Puts a tool under a team, or under Other when `teamId` is null. */
export async function setToolTeam(app: string, teamId: string | null): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  // The table has no CHECK on the slug (0114 says why), so the registry
  // is the check.
  if (!TOOLS.some((tool) => tool.href === app)) return { error: "That tool doesn't exist." };

  const supabase = await createClient();
  const { error } = teamId
    ? await supabase
        .from("tool_team_apps")
        .upsert({ app, team_id: teamId, updated_by: user.id }, { onConflict: "app" })
    : await supabase.from("tool_team_apps").delete().eq("app", app);
  if (error) {
    if (error.code === "23503") return { error: "That team no longer exists — refresh the page." };
    console.error("setToolTeam failed:", error);
    return { error: "Could not move the tool. Try again." };
  }

  refreshEverywhere();
  return undefined;
}
