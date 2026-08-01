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
  // round trip on every gated query.
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, team, user_apps(app)")
    .eq("id", userId)
    .single();

  // No profile row means no such staff member — every real user gets one
  // from the handle_new_user trigger at signup (0001_profiles.sql). This
  // used to return a truthy object with profile: null, which made
  // requireUser() succeed for an id that doesn't exist. Gated screens
  // were still safe (an empty grant list fails requireApp), but "signed
  // in" should mean a real person.
  if (!data) return null;

  return {
    id: userId,
    email: userEmail,
    profile: {
      id: data.id,
      full_name: data.full_name,
      role: data.role,
      team: data.team,
    } satisfies Profile,
    grantedApps: (data.user_apps ?? []).map((row) => row.app),
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
