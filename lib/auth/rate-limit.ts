import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { lockoutMessage, nextAttempt } from "./lockout";

/**
 * DB-backed guessing limits for the sign-in flow — the password step,
 * the emailed code, and reset requests — in `login_attempts` (0062): a
 * table, because serverless functions share no memory between calls.
 * Deny-all under RLS, so only the service-role client reaches it: the
 * people being counted must not be able to reset the count.
 *
 * checkLockout is called BEFORE the guess is examined, so a locked-out
 * attacker isn't even told whether it was right. Every function fails
 * closed: a count it cannot read or write refuses the attempt.
 */

export type AttemptKind = "password" | "otp" | "reset";

/** A refusal ready to show, or null to carry on. */
export type Refusal = { error: string } | null;

const UNAVAILABLE: Refusal = { error: "Could not check your sign-in just now. Try again." };

function normalize(email: string) {
  return email.trim().toLowerCase();
}

export async function checkLockout(email: string, kind: AttemptKind): Promise<Refusal> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("login_attempts")
    .select("locked_until")
    .eq("target", normalize(email))
    .eq("kind", kind)
    .maybeSingle();
  if (error) {
    console.error("checkLockout failed:", error);
    return UNAVAILABLE;
  }

  if (!data?.locked_until) return null;
  const lockedUntil = new Date(data.locked_until);
  return lockedUntil > new Date() ? { error: lockoutMessage(lockedUntil) } : null;
}

/** Records a failure (or, for 'reset', another request) and locks the
 * target if there have been too many inside the rolling window. */
export async function recordFailure(email: string, kind: AttemptKind): Promise<Refusal> {
  const supabase = createAdminClient();
  const now = new Date();
  const target = normalize(email);

  const { data: existing, error: readError } = await supabase
    .from("login_attempts")
    .select("failed_count, window_started_at")
    .eq("target", target)
    .eq("kind", kind)
    .maybeSingle();
  if (readError) {
    console.error("recordFailure read failed:", readError);
    return UNAVAILABLE;
  }

  const next = nextAttempt(existing, now);

  const { error: writeError } = await supabase.from("login_attempts").upsert(
    {
      target,
      kind,
      failed_count: next.failedCount,
      window_started_at: next.windowStartedAt.toISOString(),
      locked_until: next.lockedUntil?.toISOString() ?? null,
    },
    { onConflict: "target,kind" },
  );
  if (writeError) {
    console.error("recordFailure write failed:", writeError);
    return UNAVAILABLE;
  }

  return next.lockedUntil ? { error: lockoutMessage(next.lockedUntil) } : null;
}

/** A correct guess wipes the slate. A failure to wipe only leaves old
 * failures counting, so it is logged, not refused. */
export async function clearFailures(email: string, kind: AttemptKind) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("login_attempts")
    .delete()
    .eq("target", normalize(email))
    .eq("kind", kind);
  if (error) console.error("clearFailures failed:", error);
}
