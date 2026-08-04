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
// Type-only import, and deliberately NOT re-exported — see the note in
// lib/budgets/actions.ts: a type re-export from a "use server" file can
// survive into the compiled module's runtime export list and crash it.
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

// The named indent-approver switch — same shape as a grant, backed by
// indent_approvers (migration 0019) instead of user_apps. The DB-side
// indents_guard trigger reads the same table, so ticking here is what
// actually lets someone approve, not just what shows them the button.
export async function setIndentApprover(userId: string, canApprove: boolean): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  if (canApprove) {
    const { error } = await supabase
      .from("indent_approvers")
      .insert({ user_id: userId, granted_by: user.id });
    // Re-ticking someone already on the list hits the primary key and is
    // a harmless no-op from the admin's point of view.
    if (error && error.code !== "23505") {
      console.error("setIndentApprover failed:", error);
      return { error: "Could not make this person an approver. Try again." };
    }
  } else {
    const { error } = await supabase.from("indent_approvers").delete().eq("user_id", userId);
    if (error) {
      console.error("setIndentApprover failed:", error);
      return { error: "Could not remove this approver. Try again." };
    }
  }

  revalidatePath("/settings");
  return undefined;
}

// The bill twin — backed by bill_approvers (migration 0025), read by
// the bills_guard trigger, so ticking here is what actually lets
// someone approve a bill, not just what shows them the button.
export async function setBillApprover(userId: string, canApprove: boolean): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  if (canApprove) {
    const { error } = await supabase
      .from("bill_approvers")
      .insert({ user_id: userId, granted_by: user.id });
    // Re-ticking someone already on the list hits the primary key and is
    // a harmless no-op from the admin's point of view.
    if (error && error.code !== "23505") {
      console.error("setBillApprover failed:", error);
      return { error: "Could not make this person an approver. Try again." };
    }
  } else {
    const { error } = await supabase.from("bill_approvers").delete().eq("user_id", userId);
    if (error) {
      console.error("setBillApprover failed:", error);
      return { error: "Could not remove this approver. Try again." };
    }
  }

  revalidatePath("/settings");
  return undefined;
}
