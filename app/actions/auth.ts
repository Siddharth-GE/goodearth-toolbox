"use server";

// app/actions/ is for platform-level concerns shared by every tool
// (today: just login/logout) — not where a tool's own actions go.
// Tool-specific actions belong in lib/<tool>/actions.ts instead,
// alongside that tool's queries.ts (see lib/marathon/actions.ts).

import { checkLockout, clearFailures, lockoutMessage, recordFailure } from "@/lib/auth/rate-limit";
import {
  clearChallenge,
  clearVerified,
  getChallenge,
  isTrustedDevice,
  markSessionVerified,
  setChallenge,
  setTrustedDevice,
  setVerified,
} from "@/lib/auth/verified-session";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { createClient as createBareClient } from "@supabase/supabase-js";
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

/**
 * Step one of signing in: the password.
 *
 * The password is checked on a throwaway in-memory client, NOT the
 * cookie-backed one — so no session ever reaches the browser before the
 * code step is passed. The discarded session is harmless: it holds no
 * verified-sessions row, so after 0063 it can reach nothing gated, and
 * it expires on its own.
 *
 * A trusted device (this browser finished a code inside 30 days) signs
 * in directly; anything else is owed a code screen.
 */
export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  // Locked out? Say only that — not whether the password would have been
  // right. checkLockout before the guess is examined, like the kiosk.
  const locked = await checkLockout(email, "password");
  if (locked) return { error: lockoutMessage(locked.lockedUntil) };

  const bare = createBareClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await bare.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    const nowLocked = await recordFailure(email, "password");
    if (nowLocked) return { error: lockoutMessage(nowLocked.lockedUntil) };
    return { error: "Incorrect email or password." };
  }
  await clearFailures(email, "password");

  // The credentials are right, but the account may have been switched
  // off. Refusing here is clearer than letting them in to a dashboard
  // where every screen redirects (0032). The bare client still holds
  // the throwaway session in memory, so RLS lets it read the row.
  const { data: profile } = await bare
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile && !profile.is_active) {
    return { error: "This account has been deactivated. Ask an admin to switch it back on." };
  }

  // A remembered device skips the code, never the password. This is the
  // one place the real (cookie-backed) session is minted without a code.
  if (await isTrustedDevice(data.user.id)) {
    const supabase = await createClient();
    const { error: sessionError } = await supabase.auth.signInWithPassword({ email, password });
    if (sessionError) return { error: "Could not sign you in. Try again." };
    await markSessionVerified("trusted");
    await setVerified(data.user.id);
    redirect("/");
  }

  // Everyone else gets a code. Supabase generates, hashes and emails it;
  // this code never passes through our hands.
  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (otpError) {
    console.error("login: could not send the code:", otpError.message);
    return { error: "Couldn't send the code email. Wait a minute and try again." };
  }

  await setChallenge(email);
  redirect("/login/verify");
}

export type VerifyState = { error?: string } | undefined;

/**
 * Step two: the emailed 6-digit code.
 *
 * Only reachable behind a challenge cookie, which only the login action
 * sets, and only after a correct password — so a right code from
 * someone who never proved the password gets nothing here. verifyOtp
 * mints the real session; the verified-sessions row minted right after
 * is what the database trusts (0063), not the cookie.
 */
export async function verifyLoginCode(
  _state: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const code = String(formData.get("code") ?? "").trim();

  const challenge = await getChallenge();
  if (!challenge) redirect("/login");
  const email = challenge.subject;

  if (!/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code from the email." };
  }

  const locked = await checkLockout(email, "otp");
  if (locked) return { error: lockoutMessage(locked.lockedUntil) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

  if (error || !data.user) {
    const nowLocked = await recordFailure(email, "otp");
    if (nowLocked) return { error: lockoutMessage(nowLocked.lockedUntil) };
    return { error: "That code isn't right — check the latest email." };
  }
  await clearFailures(email, "otp");

  // Re-checked with the real session: the account could have been
  // switched off between the password step and now.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile || !profile.is_active) {
    await supabase.auth.signOut();
    await clearChallenge();
    return { error: "This account has been deactivated. Ask an admin to switch it back on." };
  }

  await markSessionVerified("otp");
  await setVerified(data.user.id);
  await setTrustedDevice(data.user.id);
  await clearChallenge();
  redirect("/");
}

/** Another code, for the same proven password — 60s between sends. */
export async function resendLoginCode(): Promise<VerifyState> {
  const challenge = await getChallenge();
  if (!challenge) redirect("/login");

  if (challenge.sentAt && Date.now() - challenge.sentAt < 60_000) {
    return { error: "Just sent one — give it a minute, and check spam." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: challenge.subject,
    options: { shouldCreateUser: false },
  });
  if (error) {
    console.error("resendLoginCode failed:", error.message);
    return { error: "Couldn't send the code email. Wait a minute and try again." };
  }

  await setChallenge(challenge.subject);
  return undefined;
}

/**
 * Starts the Google sign-in. Supabase links a verified Google email to
 * its existing account automatically, and the project refuses signups —
 * so only an email that already belongs to the team comes back from
 * this with a session. /auth/callback finishes the trip.
 */
export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl()}/auth/callback`,
      // Always show the account chooser — on a shared site phone, the
      // previous person's Google account must not be silently reused.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("signInWithGoogle failed:", error?.message);
    redirect("/login?error=auth");
  }
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // The verified marker and any half-finished challenge go with the
  // session. The trusted-device cookie deliberately stays — it only
  // skips the code, never the password.
  await clearVerified();
  await clearChallenge();
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
