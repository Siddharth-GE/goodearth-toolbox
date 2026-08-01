import "server-only";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";

export type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  team: string | null;
};

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();

  // proxy.ts already verifies the session with Supabase Auth on every
  // matched request (its matcher covers everything except static
  // assets) and hands the verified id down via this header, which it
  // always sets or strips itself — a client can never inject its own
  // value here. That means we don't need to hit Supabase Auth a second
  // time just to learn who's already been verified a moment ago; we
  // fall back to a real check only if the header is missing, e.g. a
  // request proxy's matcher doesn't cover.
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
  // round trip on every gated query.
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, team, user_apps(app)")
    .eq("id", userId)
    .single();

  const profile: Profile | null = data
    ? { id: data.id, full_name: data.full_name, role: data.role, team: data.team }
    : null;
  const grantedApps = (data?.user_apps ?? []).map((row) => row.app);

  return {
    id: userId,
    email: userEmail,
    profile,
    grantedApps,
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
