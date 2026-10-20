"use server";

// Platform actions shared by every tool (sign-in); a tool's own go in lib/<tool>/actions.ts.

import { checkLockout, clearFailures, recordFailure } from "@/lib/auth/rate-limit";
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
import { APP_AUTH_CALLBACK, isPhoneApp } from "@/lib/native/app";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type LoginState = { error?: string } | undefined;

// Not imported from lib/settings: the shell never imports a tool. 8 is Supabase's minimum.
const MIN_PASSWORD_LENGTH = 8;

// Catches a missing "@", nothing more.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * This request's origin, so reset links and Google come back to the deployment
 * that started them. Trusting the host header is safe only because Supabase's
 * redirect allow-list is the gate: a forged host falls back to the Site URL.
 */
async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  const value = process.env.SITE_URL;
  if (!value) throw new Error("SITE_URL is not set");
  return value.replace(/\/$/, "");
}

/**
 * Step one, the password, checked on a throwaway in-memory client so no session
 * reaches the browser before the code. That session has no verified-sessions
 * row, so it reaches nothing gated (0063). A trusted device skips the code.
 */
export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  // Checked before the guess, so a locked-out guesser learns nothing.
  const locked = await checkLockout(email, "password");
  if (locked) return locked;

  const bare = createBareClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await bare.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return (await recordFailure(email, "password")) ?? { error: "Incorrect email or password." };
  }
  await clearFailures(email, "password");

  // Switched-off accounts are refused here, not let into a dashboard that
  // redirects everywhere (0032). The throwaway session can read its own row.
  const { data: profile, error: profileError } = await bare
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("login: profile read failed:", profileError.message);
    return { error: "Could not check your account just now. Try again." };
  }
  if (profile && !profile.is_active) {
    return { error: "This account has been deactivated. Ask an admin to switch it back on." };
  }

  // A remembered device skips the code, never the password: the one session
  // minted without a code.
  if (await isTrustedDevice(data.user.id)) {
    const supabase = await createClient();
    const { error: sessionError } = await supabase.auth.signInWithPassword({ email, password });
    if (sessionError) return { error: "Could not sign you in. Try again." };
    await markSessionVerified("trusted");
    await setVerified(data.user.id);
    redirect("/");
  }

  // Supabase makes, hashes and emails the code; it never passes through us.
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
 * Step two, the emailed code, reachable only behind the challenge cookie a
 * correct password sets. The verified-sessions row (0063) is what the
 * database trusts, not the cookie.
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
  if (locked) return locked;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

  if (error || !data.user) {
    return (
      (await recordFailure(email, "otp")) ?? {
        error: "That code isn't right — check the latest email.",
      }
    );
  }
  await clearFailures(email, "otp");

  // Re-checked: the account could have been switched off since the password.
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
 * Google sign-in. Signups are refused, so only an email already on the team
 * comes back with a session; /auth/callback finishes it.
 */
export async function signInWithGoogle() {
  // In the phone app, Google returns to the app, which finishes on this site's callback.
  const inApp = isPhoneApp((await headers()).get("user-agent"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: inApp ? APP_AUTH_CALLBACK : `${await requestOrigin()}/auth/callback`,
      // Always ask: a shared site phone must not reuse the last person's Google.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("signInWithGoogle failed:", error?.message);
    redirect("/login?error=auth");
  }
  redirect(data.url);
}

/** `pushToken`: in the phone app, this phone's notifications stop with the sign-out (lib/push/). */
export async function logout(pushToken?: string) {
  const supabase = await createClient();
  if (typeof pushToken === "string" && pushToken) {
    const { error } = await supabase.from("push_devices").delete().eq("token", pushToken);
    if (error) console.error("logout: forgetting this phone failed:", error.code);
  }
  await supabase.auth.signOut();
  // The trusted-device cookie stays: it skips only the code, never the password.
  await clearVerified();
  await clearChallenge();
  redirect("/login");
}

export type ResetRequestState = { error?: string; success?: string } | undefined;

/**
 * Emails a reset link. The answer is the same whether or not the account exists,
 * and the per-email limit runs before sending, so the form can't probe
 * addresses or flood a colleague's inbox.
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
    redirectTo: `${await requestOrigin()}/auth/confirm`,
  });
  // Logged, never shown: the message must not depend on whether the account exists.
  if (error) console.error("sendPasswordReset failed:", error.message);

  return neutral;
}

export type ResetPasswordState = { error?: string } | undefined;

/**
 * Sets the new password for a recovery session (/auth/confirm), then signs out
 * every session everywhere: a leaked password leaves only dead sessions behind.
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

  // A switched-off person can still open the emailed link, but must not walk back in.
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

  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?reset=done");
}
