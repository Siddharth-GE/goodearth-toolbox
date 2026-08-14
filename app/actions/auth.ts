"use server";

// app/actions/ is for platform-level concerns shared by every tool
// (today: just login/logout) — not where a tool's own actions go.
// Tool-specific actions belong in lib/<tool>/actions.ts instead,
// alongside that tool's queries.ts (see lib/marathon/actions.ts).

import { checkLockout, clearFailures, recordFailure } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type LoginState = { error?: string } | undefined;

// Stated here rather than imported from lib/settings/invite.ts: the shell
// never imports a tool's code, and 8 is Supabase's own minimum — if one
// changes, the other must anyway.
const MIN_PASSWORD_LENGTH = 8;

// Deliberately loose, same as lib/settings/invite.ts: catch a missing
// "@", not adjudicate RFC 5322.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function siteUrl() {
  const value = process.env.SITE_URL;
  if (!value) throw new Error("SITE_URL is not set");
  return value.replace(/\/$/, "");
}

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Incorrect email or password." };
  }

  // The credentials are right, but the account may have been switched
  // off. Signing them straight back out is clearer than letting them in
  // to a dashboard where every screen redirects (0032).
  if (data.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      return { error: "This account has been deactivated. Ask an admin to switch it back on." };
    }
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type ResetRequestState = { error?: string; success?: string } | undefined;

/**
 * Emails a password-reset link.
 *
 * The response is the same neutral sentence whether or not the email has
 * an account, so this form can't be used to test which addresses exist.
 * The rate limit runs per email BEFORE anything is sent — its job here
 * is stopping a prankster hosing a colleague's inbox — and a locked-out
 * requester gets the same neutral sentence, for the same reason.
 */
export async function sendPasswordReset(
  _state: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !EMAIL_SHAPE.test(email)) {
    return { error: "Enter your email address." };
  }

  const neutral = {
    success: "If that email has an account, a reset link is on its way. It works for 10 minutes.",
  };

  if (await checkLockout(email, "reset")) return neutral;
  await recordFailure(email, "reset");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm`,
  });
  // A failed send (rate limit, SMTP trouble) is logged for us but never
  // shown — the message must not vary by whether the account exists.
  if (error) console.error("sendPasswordReset failed:", error.message);

  return neutral;
}

export type ResetPasswordState = { error?: string } | undefined;

/**
 * Sets the new password, for someone holding a recovery session (they
 * arrived through the emailed link via /auth/confirm).
 *
 * Ends by signing out EVERY session everywhere, including this one — if
 * the password was changed because it leaked, whoever else holds it is
 * holding a dead session afterwards. The owner signs back in fresh.
 */
export async function completePasswordReset(
  _state: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `The new password needs at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A deactivated person can open the emailed link (deactivation doesn't
  // kill mail delivery) but must not be able to set a password and walk
  // back in. Same wording as the login screen.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return { error: "Could not check your account. Try again." };
  }
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated. Ask an admin to switch it back on." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/different from the old password|same/i.test(error.message)) {
      return { error: "That's the same as your current password — pick a new one." };
    }
    console.error("completePasswordReset failed:", error.message);
    return { error: "Could not change the password. Try again." };
  }

  // A fresh password wipes the lockout slate for the sign-in ahead.
  if (user.email) await clearFailures(user.email, "password");

  // Kill every session on every device — this one included.
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?reset=done");
}
