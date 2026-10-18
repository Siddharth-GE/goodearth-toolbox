import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maskEmail, signPayload, verifyPayload, type SignedPayload } from "./signed-cookie";

/**
 * The 2FA flow's three cookies, HMAC-signed (AUTH_COOKIE_SECRET) and httpOnly:
 *   ge_challenge — the password was right minutes ago; a code is owed (10 min).
 *   ge_verified  — the full sign-in finished. UX only: the database row enforces.
 *   ge_trusted   — a code was done here within 30 days; skips the code, never
 *                  the password.
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

/**
 * Records this session as fully signed in. Without the row has_app() and
 * is_admin() refuse it (0063), so a stolen password alone mints nothing useful.
 * Service-role on purpose: the table is deny-all, so a session cannot write its
 * own pass. Throws: signing in again beats every tool showing nothing.
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

  // Old rows die here, which doubles as a maximum session age. Failure is harmless.
  const cutoff = new Date(Date.now() - VERIFIED_TTL_MS).toISOString();
  const { error: sweepError } = await admin
    .from("auth_verified_sessions")
    .delete()
    .lt("created_at", cutoff);
  if (sweepError) console.error("verified-session sweep failed:", sweepError);
}

export { maskEmail };
