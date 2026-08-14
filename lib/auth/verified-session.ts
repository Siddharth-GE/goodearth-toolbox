import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maskEmail, signPayload, verifyPayload, type SignedPayload } from "./signed-cookie";

/**
 * The three cookies of the 2FA flow, and the database marking that makes
 * it enforceable.
 *
 *   ge_challenge  — "this browser proved the password minutes ago and is
 *                    owed a code screen". Set by the login action, read
 *                    by /login/verify. 10 minutes, then the whole flow
 *                    starts over.
 *   ge_verified   — "this browser completed the full sign-in". Read by
 *                    requireUser() to route half-signed-in sessions to
 *                    the code screen. UX only: the enforcing half is the
 *                    auth_verified_sessions row (0062/0063).
 *   ge_trusted    — "this device finished a code within 30 days". Lets
 *                    the login action skip the code step. It never skips
 *                    the password, so a stolen one is worthless alone.
 *
 * All HMAC-signed with AUTH_COOKIE_SECRET (lib/auth/signed-cookie.ts),
 * httpOnly, lax. The browser can hold these statements; only the server
 * can write them.
 */

const CHALLENGE_COOKIE = "ge_challenge";
const VERIFIED_COOKIE = "ge_verified";
const TRUSTED_COOKIE = "ge_trusted";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
/** Also the DB row cleanup age below — a session older than this re-signs in. */
const VERIFIED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TRUSTED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  const value = process.env.AUTH_COOKIE_SECRET;
  if (!value) throw new Error("AUTH_COOKIE_SECRET is not set");
  return value;
}

async function setCookie(name: string, payload: SignedPayload) {
  const cookieStore = await cookies();
  cookieStore.set(name, signPayload(payload, secret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.ceil((payload.exp - Date.now()) / 1000),
  });
}

async function readCookie(name: string, kind: SignedPayload["kind"]) {
  const cookieStore = await cookies();
  const token = cookieStore.get(name)?.value;
  if (!token) return null;
  return verifyPayload(token, kind, secret());
}

async function clearCookie(name: string) {
  const cookieStore = await cookies();
  cookieStore.set(name, "", { path: "/", maxAge: 0 });
}

// The challenge ------------------------------------------------------------

export async function setChallenge(email: string) {
  const now = Date.now();
  await setCookie(CHALLENGE_COOKIE, {
    kind: "challenge",
    subject: email,
    exp: now + CHALLENGE_TTL_MS,
    sentAt: now,
  });
}

export async function getChallenge() {
  return readCookie(CHALLENGE_COOKIE, "challenge");
}

export async function clearChallenge() {
  await clearCookie(CHALLENGE_COOKIE);
}

// The verified marker ------------------------------------------------------

export async function setVerified(userId: string) {
  await setCookie(VERIFIED_COOKIE, {
    kind: "verified",
    subject: userId,
    exp: Date.now() + VERIFIED_TTL_MS,
  });
}

/** True when this browser's verified cookie vouches for exactly this user. */
export async function isVerified(userId: string) {
  const payload = await readCookie(VERIFIED_COOKIE, "verified");
  return payload?.subject === userId;
}

export async function clearVerified() {
  await clearCookie(VERIFIED_COOKIE);
}

// The trusted device -------------------------------------------------------

export async function setTrustedDevice(userId: string) {
  await setCookie(TRUSTED_COOKIE, {
    kind: "trusted",
    subject: userId,
    exp: Date.now() + TRUSTED_TTL_MS,
  });
}

export async function isTrustedDevice(userId: string) {
  const payload = await readCookie(TRUSTED_COOKIE, "trusted");
  return payload?.subject === userId;
}

// The database half --------------------------------------------------------

/**
 * Records the CURRENT session (the one in this request's cookies) as
 * having completed the full sign-in. After 0063, has_app() and
 * is_admin() answer false for any session without this row — which is
 * what stops a stolen password minting a useful session straight from
 * the auth API with the public anon key.
 *
 * Service-role on purpose, and the table is deny-all under RLS: the very
 * session being screened must not be able to write its own pass. This is
 * a sanctioned admin-client use, documented in CLAUDE.md.
 *
 * Throws on failure — "signed in but every tool shows nothing" is a
 * worse outcome than asking the person to sign in again.
 */
export async function markSessionVerified(method: "otp" | "trusted" | "oauth") {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const sessionId = typeof claims?.session_id === "string" ? claims.session_id : null;
  const userId = claims?.sub;
  if (!sessionId || !userId) {
    throw new Error("markSessionVerified: no session in this request");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("auth_verified_sessions")
    .upsert({ session_id: sessionId, user_id: userId, method }, { onConflict: "session_id" });
  if (error) {
    console.error("markSessionVerified failed:", error);
    throw new Error("Could not complete sign-in. Try again.");
  }

  // Opportunistic sweep: rows past the trusted-device age die, which
  // doubles as a maximum session age — has_app() stops answering for
  // them and the person signs in afresh. Failure here is harmless.
  const cutoff = new Date(Date.now() - VERIFIED_TTL_MS).toISOString();
  const { error: sweepError } = await admin
    .from("auth_verified_sessions")
    .delete()
    .lt("created_at", cutoff);
  if (sweepError) console.error("verified-session sweep failed:", sweepError);
}

export { maskEmail };
