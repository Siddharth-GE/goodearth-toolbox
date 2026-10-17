import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { lockoutMessage } from "./pin";

/**
 * Guessing limits for the Marathon PIN screens. /marathon is a public
 * kiosk URL and a PIN is the only thing protecting an agent's account.
 * Ten wrong attempts in ten minutes locks for ten: far more slack than
 * an honest mistake needs, and weeks for a brute force. Every function
 * fails closed: a count it cannot read or write refuses the attempt.
 */
const MAX_FAILURES = 10;
const WINDOW_MINUTES = 10;
const LOCKOUT_MINUTES = 10;

/** The literal target used for the shared admin PIN, which has no agent id. */
export const ADMIN_TARGET = "admin";

/** A refusal ready to show, or null to carry on. */
export type Refusal = { error: string } | null;

const UNAVAILABLE: Refusal = { error: "Could not check that PIN. Try again." };

/** Called before the PIN is checked, so a locked-out attacker isn't even
 * told whether their guess was right. */
export async function checkLockout(target: string): Promise<Refusal> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marathon_pin_attempts")
    .select("locked_until")
    .eq("target", target)
    .maybeSingle();
  if (error) {
    console.error("checkLockout failed:", error);
    return UNAVAILABLE;
  }

  if (!data?.locked_until) return null;
  const lockedUntil = new Date(data.locked_until);
  return lockedUntil > new Date() ? { error: lockoutMessage({ lockedUntil }) } : null;
}

/** Records a wrong PIN, and locks the target if there have been too many
 * inside the rolling window. */
export async function recordFailure(target: string): Promise<Refusal> {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: existing, error: readError } = await supabase
    .from("marathon_pin_attempts")
    .select("failed_count, window_started_at")
    .eq("target", target)
    .maybeSingle();
  if (readError) {
    console.error("recordFailure read failed:", readError);
    return UNAVAILABLE;
  }

  const windowStart = existing ? new Date(existing.window_started_at) : now;
  const windowExpired = now.getTime() - windowStart.getTime() > WINDOW_MINUTES * 60_000;

  const failedCount = existing && !windowExpired ? existing.failed_count + 1 : 1;
  const locked = failedCount >= MAX_FAILURES;
  const lockedUntil = locked ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : null;

  const { error: writeError } = await supabase.from("marathon_pin_attempts").upsert(
    {
      target,
      // Locking resets the counter, so the next lockout needs another
      // full run of failures rather than triggering on every attempt.
      failed_count: locked ? 0 : failedCount,
      window_started_at: (windowExpired || locked ? now : windowStart).toISOString(),
      locked_until: lockedUntil?.toISOString() ?? null,
    },
    { onConflict: "target" },
  );
  if (writeError) {
    console.error("recordFailure write failed:", writeError);
    return UNAVAILABLE;
  }

  return lockedUntil ? { error: lockoutMessage({ lockedUntil }) } : null;
}

/** A correct PIN wipes the slate. A failure to wipe only leaves old
 * failures counting, so it is logged, not refused. */
export async function clearFailures(target: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("marathon_pin_attempts").delete().eq("target", target);
  if (error) console.error("clearFailures failed:", error);
}
