import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/auth/verified-session";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";

export type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  team: string | null;
  is_active: boolean;
  /** The assigned role template (0034), or null for no role. */
  role_id: string | null;
};

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();

  // proxy.ts verifies the session and sets or strips this header, so there is no
  // second Supabase round trip. Only as trustworthy as proxy.ts's matcher.
  const requestHeaders = await headers();
  const headerUserId = requestHeaders.get("x-user-id");

  let userId: string;
  let userEmail: string;

  if (headerUserId) {
    userId = headerUserId;
    userEmail = requestHeaders.get("x-user-email") ?? "";
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
    userEmail = user.email ?? "";
  }

  // Grants and the role's bundle ride on the profile read. The FK is named:
  // roles has two more FKs to profiles, and a bare embed is refused (PGRST201).
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, team, is_active, role_id, user_apps(app), roles!profiles_role_id_fkey(role_apps(app))",
    )
    .eq("id", userId)
    .single();

  // A failed read is not a statement about who someone is: throw to the error
  // screen, never redirect to /login (that loops with proxy.ts).
  if (error) {
    console.error("getCurrentUser profile read failed:", error);
    throw new Error("Could not read your profile.", { cause: error });
  }

  // No profile row means no such staff member (handle_new_user makes one per signup).
  if (!data) return null;

  // Switched off is treated as signed out; has_app() and is_admin() refuse them
  // too (0032). Their JWT stays valid, which is why proxy.ts must not bounce /login.
  if (!data.is_active) return null;

  // The union, computed per request, so a role edit applies at once. has_app()
  // (0034) is the boundary that holds.
  const personalApps = (data.user_apps ?? []).map((row) => row.app);
  const roleApps = (data.roles?.role_apps ?? []).map((row) => row.app);

  return {
    id: userId,
    email: userEmail,
    profile: {
      id: data.id,
      full_name: data.full_name,
      role: data.role,
      team: data.team,
      is_active: data.is_active,
      role_id: data.role_id,
    } satisfies Profile,
    grantedApps: [...new Set([...personalApps, ...roleApps])],
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // No code step yet: to the code screen. The polite half; has_app() refusing a
  // session without its verified row (0063) is the enforcing half.
  if (!(await isVerified(user.id))) redirect("/login/verify");

  return user;
}
