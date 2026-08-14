import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { lockoutMessage, nextAttempt } from "./lockout";

/**
 * DB-backed guessing limits for the sign-in flow — the password step,
 * the emailed code, and reset requests. The shape is lib/marathon/
 * rate-limit.ts (0015), pointed at login_attempts (0062): a table
 * rather than in-memory counters because Vercel's serverless functions
 * share no memory between invocations, so an in-process counter would
 * reset with every cold start and protect nothing.
 *
 * login_attempts is deny-all under RLS (0062) — the service-role client
 * is the only way in, on purpose: the people being counted are exactly
 * the people who must not be able to reset the count.
 *
 * checkLockout is called BEFORE the guess is examined, so a locked-out
 * attacker isn't even told whether it was right.
 */

export type AttemptKind = "password" | "otp" | "reset";

export type LockoutState = { lockedUntil: Date } | null;

function normalize(email: string) {
  return email.trim().toLowerCase();
}

export async function checkLockout(email: string, kind: AttemptKind): Promise<LockoutState> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("login_attempts")
    .select("locked_until")
    .eq("target", normalize(email))
    .eq("kind", kind)
    .maybeSingle();
  if (error) console.error("checkLockout failed:", error);

  if (!data?.locked_until) return null;
  const lockedUntil = new Date(data.locked_until);
  return lockedUntil > new Date() ? { lockedUntil } : null;
}

/** Records a failure (or, for 'reset', another request) and locks the
 * target if there have been too many inside the rolling window. */
export async function recordFailure(email: string, kind: AttemptKind): Promise<LockoutState> {
  const supabase = createAdminClient();
  const now = new Date();
  const target = normalize(email);

  const { data: existing } = await supabase
    .from("login_attempts")
    .select("failed_count, window_started_at")
    .eq("target", target)
    .eq("kind", kind)
    .maybeSingle();

  const next = nextAttempt(existing ?? null, now);

  await supabase.from("login_attempts").upsert(
    {
      target,
      kind,
      failed_count: next.failedCount,
      window_started_at: next.windowStartedAt.toISOString(),
      locked_until: next.lockedUntil?.toISOString() ?? null,
    },
    { onConflict: "target,kind" },
  );

  return next.lockedUntil ? { lockedUntil: next.lockedUntil } : null;
}

/** A correct guess wipes the slate — nothing to carry forward. */
export async function clearFailures(email: string, kind: AttemptKind) {
  const supabase = createAdminClient();
  await supabase.from("login_attempts").delete().eq("target", normalize(email)).eq("kind", kind);
}

export { lockoutMessage };
