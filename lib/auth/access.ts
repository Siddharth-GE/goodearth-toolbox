import "server-only";

import { redirect } from "next/navigation";
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

// Separate from requireApp on purpose: granting/revoking other users'
// access is itself a privileged action, so it can't be delegable
// through the same app-grant mechanism it manages — Settings checks
// role directly instead.
export async function requireAdmin(user: CurrentUser) {
  if (user.profile?.role === "admin") return;
  redirect("/");
}
