import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { assertRead } from "@/lib/supabase/read-failed";

import { requireUser, type getCurrentUser } from "./dal";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Grants arrive with the profile (dal.ts), so this is a lookup, not a round trip.
export async function hasApp(user: CurrentUser, slug: string) {
  if (user.profile?.role === "admin") return true;
  return user.grantedApps.includes(slug);
}

// The sidebar decides what is shown; this decides what is allowed.
export async function requireApp(user: CurrentUser, slug: string) {
  if (await hasApp(user, slug)) return;
  redirect("/");
}

/** Every gated action and query starts here: a signed-in holder of the grant, or a redirect. */
export async function requireTool(slug: string) {
  const user = await requireUser();
  await requireApp(user, slug);
  return user;
}

/**
 * In a `scoped` tool, does this person see everyone's work (an admin or a team lead,
 * 0122)? Asks the same is_lead() the row policies ask, so screen and policy agree;
 * the policies are the boundary.
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

// Not requireApp: managing access must not be delegable through the grants it manages.
export async function requireAdmin(user: CurrentUser) {
  if (user.profile?.role === "admin") return;
  redirect("/");
}
