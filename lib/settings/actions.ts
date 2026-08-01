"use server";

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { GRANTABLE_TOOLS } from "@/lib/tools";
import { revalidatePath } from "next/cache";

/**
 * Same shape every other tool's actions return.
 *
 * These used to throw instead. A thrown Server Action escapes to the
 * error boundary rather than coming back to the caller, and the caller
 * here is a checkbox — so a failed permission change left the box
 * visually ticked while nothing had been granted. An admin would have
 * had no way to know, and the person they thought they'd given access to
 * would simply not have it.
 */
export type { ActionState } from "@/lib/action-state";
import type { ActionState } from "@/lib/action-state";

function isGrantable(app: string) {
  return GRANTABLE_TOOLS.some((tool) => tool.href === app);
}

export async function grantApp(userId: string, app: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);
  if (!isGrantable(app)) return { error: `"${app}" is not an app that can be granted.` };

  const supabase = await createClient();
  const { error } = await supabase.from("user_apps").insert({ user_id: userId, app });
  // Re-granting an app the user already has hits the primary key and is
  // a harmless no-op from the admin's point of view.
  if (error && error.code !== "23505") {
    console.error("grantApp failed:", error);
    return { error: "Could not grant access. Try again." };
  }

  revalidatePath("/settings");
  return undefined;
}

export async function revokeApp(userId: string, app: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  const { error } = await supabase.from("user_apps").delete().eq("user_id", userId).eq("app", app);
  if (error) {
    console.error("revokeApp failed:", error);
    return { error: "Could not revoke access. Try again." };
  }

  revalidatePath("/settings");
  return undefined;
}
