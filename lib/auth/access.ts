import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { assertRead } from "@/lib/supabase/read-failed";

import { requireUser, type getCurrentUser } from "./dal";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// getCurrentUser() now fetches user_apps in the same query as the
// profile (see dal.ts), so this is just a lookup on data already in
// hand — no separate round trip, and no need for its own cache().
export async function hasApp(user: CurrentUser, slug: string) {
  if (user.profile?.role === "admin") return true;
  return user.grantedApps.includes(slug);
}

// Every tool's own actions/queries call this first — the sidebar only
// decides what's *shown*, this decides what's actually *allowed*. Same
// principle as Marathon's requireAgentSession/requireAdminSession.
export async function requireApp(user: CurrentUser, slug: string) {
  if (await hasApp(user, slug)) return;
  redirect("/");
}

/**
 * The two lines every gated action and query starts with, as one call:
 * a signed-in user who holds this tool's grant, or a redirect. This is
 * the real permission boundary — sidebar visibility is cosmetic.
 */
export async function requireTool(slug: string) {
  const user = await requireUser();
  await requireApp(user, slug);
  return user;
}

/**
 * In a tool whose work is assigned (`scoped` in lib/tools.ts), does this
 * person see everyone's work — an admin, or someone ticked as the tool's
 * team lead (0122)? Everyone else sees only what is assigned to them.
 *
 * It asks the database's own is_lead(), the function every row policy in
 * such a tool asks, so a screen and the policies behind it cannot
 * disagree. The policies are the boundary; this only decides what a
 * screen offers (the team view, everyone's counts).
 */
const leadOf = cache(async (slug: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_lead", { slug });
  assertRead("Access", "whether you lead this tool", error);
  return data === true;
});

export async function isToolLead(user: CurrentUser, slug: string): Promise<boolean> {
  if (user.profile?.role === "admin") return true;
  return leadOf(slug);
}

// Separate from requireApp on purpose: granting/revoking other users'
// access is itself a privileged action, so it can't be delegable
// through the same app-grant mechanism it manages — Settings checks
// role directly instead.
export async function requireAdmin(user: CurrentUser) {
  if (user.profile?.role === "admin") return;
  redirect("/");
}
