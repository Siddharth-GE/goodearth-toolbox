import "server-only";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { getCurrentUser } from "./dal";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function getGrantedApps(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_apps").select("app").eq("user_id", userId);
  return (data ?? []).map((row) => row.app);
}

export async function hasApp(user: CurrentUser, slug: string) {
  if (user.profile?.role === "admin") return true;
  return (await getGrantedApps(user.id)).includes(slug);
}

// Every tool's own actions/queries call this first — the sidebar only
// decides what's *shown*, this decides what's actually *allowed*. Same
// principle as Marathon's requireAgentSession/requireAdminSession.
export async function requireApp(user: CurrentUser, slug: string) {
  if (await hasApp(user, slug)) return;
  redirect("/");
}

// Separate from requireApp on purpose: granting/revoking other users'
// access is itself a privileged action, so it can't be delegable
// through the same app-grant mechanism it manages — Settings checks
// role directly instead.
export async function requireAdmin(user: CurrentUser) {
  if (user.profile?.role === "admin") return;
  redirect("/");
}
