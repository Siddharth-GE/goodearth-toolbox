"use server";

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { GRANTABLE_TOOLS } from "@/lib/tools";
import { revalidatePath } from "next/cache";

function assertGrantable(app: string) {
  if (!GRANTABLE_TOOLS.some((tool) => tool.href === app)) {
    throw new Error(`"${app}" is not a grantable app.`);
  }
}

export async function grantApp(userId: string, app: string) {
  const user = await requireUser();
  await requireAdmin(user);
  assertGrantable(app);

  const supabase = await createClient();
  const { error } = await supabase.from("user_apps").insert({ user_id: userId, app });
  // Re-granting an app the user already has hits the primary key and is
  // a harmless no-op from the admin's point of view.
  if (error && error.code !== "23505") {
    console.error("grantApp failed:", error);
    throw new Error("Could not grant access. Try again.");
  }

  revalidatePath("/settings");
}

export async function revokeApp(userId: string, app: string) {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  const { error } = await supabase.from("user_apps").delete().eq("user_id", userId).eq("app", app);
  if (error) {
    console.error("revokeApp failed:", error);
    throw new Error("Could not revoke access. Try again.");
  }

  revalidatePath("/settings");
}
