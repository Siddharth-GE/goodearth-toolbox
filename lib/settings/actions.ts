"use server";

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GRANTABLE_TOOLS } from "@/lib/tools";
import { revalidatePath } from "next/cache";
import { blockedReason, validateInvite } from "./invite";

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

/**
 * The name attribution shows everywhere — avatars, hover tooltips, the
 * "approved by" lines. Set here by an admin because accounts are
 * created in the Supabase dashboard, which never asks for one; without
 * this every action a person takes renders as a quiet dash.
 */
export async function setFullName(userId: string, fullName: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const name = fullName.trim();
  if (!name) return { error: "The name can't be blank." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", userId);
  if (error) {
    console.error("setFullName failed:", error);
    return { error: "Could not save the name. Try again." };
  }

  revalidatePath("/settings");
  return undefined;
}

/**
 * Creates a real account and hands back nothing — the admin already has
 * the starting password, because they chose it.
 *
 * THE ONE SANCTIONED SERVICE-ROLE CALL IN THE DASHBOARD. Creating an
 * auth user is not expressible through RLS: auth.users has no policy
 * path for the authenticated role at all, by Supabase's design. So this
 * action alone reaches for the admin client, and only for the auth-admin
 * API — never a table write, which would silently bypass every policy
 * this app relies on. It is admin-gated above and does nothing else.
 * (Everywhere else in the dashboard: the RLS-scoped client, always.)
 *
 * The profile row, with the name already on it, is created by the
 * handle_new_user trigger (0001) from user_metadata — so nobody starts
 * life as an unnamed dash on the documents they touch.
 *
 * A temp password rather than an emailed invite link: invite mail needs
 * SMTP configured on the project, and a mail failure would leave a
 * half-made account nobody can get into.
 */
export async function inviteUser(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  const invalid = validateInvite({ fullName, email, password });
  if (invalid) return { error: invalid };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) {
    // Supabase says "already been registered" for a duplicate; say it
    // in the founder's words rather than passing the raw message on.
    if (/already/i.test(error.message)) {
      return { error: "Someone already has an account with that email." };
    }
    console.error("inviteUser failed:", error);
    return { error: "Could not create the account. Try again." };
  }

  revalidatePath("/settings");
  return undefined;
}

/**
 * Switches an account off or back on. Never deletes: the auth user and
 * every "recorded by" line stay exactly as they were, and reactivating
 * is one click. profiles_guard() (0032) is the real boundary — the
 * checks here exist so the refusal reads like a sentence.
 */
export async function setActive(userId: string, active: boolean): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();

  if (!active) {
    const [{ data: target }, { count }] = await Promise.all([
      supabase.from("profiles").select("role, is_active").eq("id", userId).maybeSingle(),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true),
    ]);
    if (!target) return { error: "That person no longer exists." };

    const blocked = blockedReason({
      targetIsAdmin: target.role === "admin",
      targetIsActive: target.is_active,
      activeAdminCount: count ?? 0,
      isSelf: userId === user.id,
    });
    if (blocked) return { error: blocked };
  }

  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", userId);
  if (error) {
    console.error("setActive failed:", error);
    return { error: "Could not change the account. Try again." };
  }

  revalidatePath("/settings");
  revalidatePath(`/settings/people/${userId}`);
  return undefined;
}

/**
 * Makes someone an admin, or takes it away.
 *
 * This reverses the old "roles change in Studio only" stance, on the
 * founder's call. It is safe to hand over now because three things hold
 * it: profiles_guard() lets only an admin change a role, refuses to
 * remove the last active admin, and audit_profiles records every change
 * with who made it.
 */
export async function setAdmin(userId: string, isAdmin: boolean): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();

  if (!isAdmin) {
    const [{ data: target }, { count }] = await Promise.all([
      supabase.from("profiles").select("role, is_active").eq("id", userId).maybeSingle(),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true),
    ]);
    if (!target) return { error: "That person no longer exists." };

    const blocked = blockedReason({
      targetIsAdmin: target.role === "admin",
      targetIsActive: target.is_active,
      activeAdminCount: count ?? 0,
      isSelf: userId === user.id,
    });
    if (blocked) return { error: blocked };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: isAdmin ? "admin" : "staff" })
    .eq("id", userId);
  if (error) {
    console.error("setAdmin failed:", error);
    return { error: "Could not change admin access. Try again." };
  }

  revalidatePath("/settings");
  revalidatePath(`/settings/people/${userId}`);
  return undefined;
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

/**
 * The ceiling on what a bill approver may approve (0033).
 *
 * Blank means unlimited, which is also what every approver had before
 * limits existed — so clearing the box restores exactly the old
 * behaviour rather than reducing someone to nothing. Zero is refused
 * for that reason: "0" reads as "no limit" to a human and would mean
 * "can approve nothing" to the database.
 */
export async function setBillApprovalLimit(userId: string, rawLimit: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const text = rawLimit.trim();
  let limit: number | null = null;
  if (text !== "") {
    const parsed = Number(text.replace(/,/g, ""));
    if (!Number.isFinite(parsed))
      return { error: "Enter an amount, or leave it blank for no limit." };
    if (parsed <= 0) return { error: "Leave it blank for no limit — zero would approve nothing." };
    limit = parsed;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bill_approvers")
    .update({ approval_limit: limit })
    .eq("user_id", userId);
  if (error) {
    console.error("setBillApprovalLimit failed:", error);
    return { error: "Could not save the limit. Try again." };
  }

  revalidatePath("/settings");
  revalidatePath(`/settings/people/${userId}`);
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
