"use server";

import { parseNumber, rawText, text } from "@/lib/form-data";
import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GRANTABLE_TOOLS, SCOPED_TOOLS } from "@/lib/tools";
import { revalidatePath } from "next/cache";
import { blockedReason, validateInvite } from "./invite";

// Type-only import, not re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";

function isGrantable(app: string) {
  return GRANTABLE_TOOLS.some((tool) => tool.href === app);
}

/** The attribution name shown everywhere; set here because accounts are made in the Supabase dashboard, which never asks for one. */
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

  revalidatePath("/settings", "layout");
  return undefined;
}

/** THE ONE SANCTIONED SERVICE-ROLE CALL IN THE DASHBOARD: auth.users has no RLS path, so only the auth-admin API is used
 * (never a table write, which would bypass policy), behind the admin gate. A temp password, not an invite: no SMTP needed. */
export async function inviteUser(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const fullName = text(formData, "full_name");
  const email = text(formData, "email").toLowerCase();
  const password = rawText(formData, "password");

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
    // Supabase's duplicate message is replaced with a plain sentence.
    if (/already/i.test(error.message)) {
      return { error: "Someone already has an account with that email." };
    }
    console.error("inviteUser failed:", error);
    return { error: "Could not create the account. Try again." };
  }

  revalidatePath("/settings", "layout");
  return undefined;
}

/** Switches an account off or on; never deletes, so every "recorded by" line stays. profiles_guard() (0032) is the real
 * boundary; these checks make the refusal a sentence. */
export async function setActive(userId: string, active: boolean): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();

  if (!active) {
    const [{ data: target, error: targetError }, { count, error: countError }] = await Promise.all([
      supabase.from("profiles").select("role, is_active").eq("id", userId).maybeSingle(),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true),
    ]);
    if (targetError || countError) {
      console.error("setActive check failed:", targetError ?? countError);
      return { error: "Could not check that account. Try again." };
    }
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

  revalidatePath("/settings", "layout");
  revalidatePath(`/settings/people/${userId}`);
  return undefined;
}

/** profiles_guard() lets only an admin change a role and refuses to remove the last active admin; audit_profiles records who. */
export async function setAdmin(userId: string, isAdmin: boolean): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();

  if (!isAdmin) {
    const [{ data: target, error: targetError }, { count, error: countError }] = await Promise.all([
      supabase.from("profiles").select("role, is_active").eq("id", userId).maybeSingle(),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true),
    ]);
    if (targetError || countError) {
      console.error("setAdmin check failed:", targetError ?? countError);
      return { error: "Could not check that account. Try again." };
    }
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

  revalidatePath("/settings", "layout");
  revalidatePath(`/settings/people/${userId}`);
  return undefined;
}

export async function grantApp(userId: string, app: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);
  if (!isGrantable(app)) return { error: `"${app}" is not an app that can be granted.` };

  const supabase = await createClient();
  const { error } = await supabase.from("user_apps").insert({ user_id: userId, app });
  // Re-granting hits the primary key: a harmless no-op.
  if (error && error.code !== "23505") {
    console.error("grantApp failed:", error);
    return { error: "Could not grant access. Try again." };
  }

  revalidatePath("/settings", "layout");
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

  // The lead tick goes with its grant, so it never returns unseen with a later grant (0122).
  const { error: leadError } = await supabase
    .from("tool_leads")
    .delete()
    .eq("user_id", userId)
    .eq("app", app);
  if (leadError) {
    console.error("revokeApp lead cleanup failed:", leadError);
    return { error: "Access removed, but their team lead tick stayed. Untick it by hand." };
  }

  revalidatePath("/settings", "layout");
  return undefined;
}

/** Team lead sees everyone's work in a scoped tool (0122), others only their own. Does nothing without the grant,
 * so the person page offers it only beside one. */
export async function setToolLead(
  userId: string,
  app: string,
  isLead: boolean,
): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);
  if (!SCOPED_TOOLS.includes(app)) {
    return { error: "Everyone already sees all of that app's work — there is no lead to pick." };
  }

  const supabase = await createClient();
  if (isLead) {
    const { error } = await supabase.from("tool_leads").insert({ user_id: userId, app });
    if (error && error.code !== "23505") {
      console.error("setToolLead failed:", error);
      return { error: "Could not make them team lead. Try again." };
    }
  } else {
    const { error } = await supabase
      .from("tool_leads")
      .delete()
      .eq("user_id", userId)
      .eq("app", app);
    if (error) {
      console.error("setToolLead failed:", error);
      return { error: "Could not remove them as team lead. Try again." };
    }
  }

  revalidatePath("/settings", "layout");
  return undefined;
}

// The named indent-approver switch, backed by indent_approvers (0019), which indents_guard also reads: ticking is what lets someone approve.
export async function setIndentApprover(userId: string, canApprove: boolean): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  if (canApprove) {
    const { error } = await supabase
      .from("indent_approvers")
      .insert({ user_id: userId, granted_by: user.id });
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

  revalidatePath("/settings", "layout");
  return undefined;
}

/** Ceiling on what a bill approver may approve (0033). Blank is unlimited; zero is refused: a human reads it as "no limit", the database as "nothing". */
export async function setBillApprovalLimit(userId: string, rawLimit: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const limit = parseNumber(rawLimit);
  if (limit !== null) {
    if (!Number.isFinite(limit))
      return { error: "Enter an amount, or leave it blank for no limit." };
    if (limit <= 0) return { error: "Leave it blank for no limit — zero would approve nothing." };
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

  revalidatePath("/settings", "layout");
  revalidatePath(`/settings/people/${userId}`);
  return undefined;
}

// The bill twin, backed by bill_approvers (0025) and read by bills_guard.
export async function setBillApprover(userId: string, canApprove: boolean): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  if (canApprove) {
    const { error } = await supabase
      .from("bill_approvers")
      .insert({ user_id: userId, granted_by: user.id });
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

  revalidatePath("/settings", "layout");
  return undefined;
}
