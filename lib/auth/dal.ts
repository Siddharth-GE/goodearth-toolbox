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

  // proxy.ts verifies the session with Supabase Auth on every matched
  // request and hands the verified id down via this header, which it
  // sets or strips itself — so on a matched path we don't hit Supabase
  // Auth a second time just to learn who was verified a moment ago.
  //
  // This header is only as trustworthy as the matcher. It used to also
  // skip any path ending .png/.jpg/etc, which a dynamic route segment can
  // end with, leaving those paths unstripped — see proxy.ts, where the
  // matcher has since been narrowed to genuine static assets. Treat any
  // change to that matcher as a change to this trust boundary.
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

  // user_apps is fetched in the same request as the profile — see
  // lib/auth/access.ts, which used to do this as its own separate
  // round trip on every gated query. The role's bundle rides along on
  // the same trip via the role_id FK (0034), so granting through a role
  // costs nothing extra per request.
  // The FK is named explicitly: `roles` also carries created_by and
  // updated_by pointing back at profiles (0034), so a bare `roles(…)`
  // is ambiguous and PostgREST refuses it outright (PGRST201) — which
  // silently signed everyone out until it was named.
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, team, is_active, role_id, user_apps(app), roles!profiles_role_id_fkey(role_apps(app))",
    )
    .eq("id", userId)
    .single();

  // A broken query is NOT a statement about who someone is. Returning
  // null here used to answer "the database is unreachable" with
  // redirect("/login") — and proxy.ts sent anyone holding a valid JWT
  // straight back to "/", so a transient failure looped the browser
  // until it gave up with ERR_TOO_MANY_REDIRECTS. Every tool down, the
  // shell down, nothing on screen saying why. Throwing instead puts it
  // in front of an error boundary, where a failure belongs.
  if (error) {
    console.error("getCurrentUser profile read failed:", error);
    throw new Error("Could not read your profile.", { cause: error });
  }

  // No profile row means no such staff member — every real user gets one
  // from the handle_new_user trigger at signup (0001_profiles.sql). This
  // used to return a truthy object with profile: null, which made
  // requireUser() succeed for an id that doesn't exist. Gated screens
  // were still safe (an empty grant list fails requireApp), but "signed
  // in" should mean a real person.
  if (!data) return null;

  // A deactivated person is treated exactly like a signed-out one: every
  // requireUser() lands on /login, and every gated query redirects. The
  // database agrees independently — is_admin() and has_app() (0032) both
  // answer false for them, so this is the polite half of the rule, not
  // the enforcing half.
  //
  // Their Supabase Auth session stays valid until it expires — setActive
  // only flips this column. So this redirect happens with a good JWT in
  // the cookie, which is exactly the case proxy.ts must not bounce back.
  if (!data.is_active) return null;

  // Effective access is the union, computed here on every request
  // rather than copied anywhere — so editing a role takes effect for
  // everyone holding it immediately. Mirrors has_app() (0034), which is
  // the boundary that actually holds.
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

  // A session that never finished the code step (or one from before 2FA
  // launched) is routed to the code screen rather than rendered a
  // dashboard the database will answer emptily — after 0063, has_app()
  // refuses any session without its auth_verified_sessions row. This
  // cookie check is the polite half; the row is the enforcing half.
  // /login/verify sends anyone without a live challenge back to /login.
  if (!(await isVerified(user.id))) redirect("/login/verify");

  return user;
}
