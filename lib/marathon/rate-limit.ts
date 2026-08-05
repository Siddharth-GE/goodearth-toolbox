import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Guessing limits for the Marathon PIN screens.
 *
 * /marathon has no login of its own — it's a public kiosk URL, and a PIN
 * is the only thing protecting an agent's account. Without a limit, ten
 * thousand combinations is a few minutes of scripted requests.
 *
 * The numbers are chosen for the room this actually runs in: field agents
 * with basic literacy, on race day, tapping a number pad. Ten wrong
 * attempts before a lockout is far more slack than an honest mistake
 * needs, and still turns a brute-force attempt into something that would
 * take weeks.
 */
const MAX_FAILURES = 10;
const WINDOW_MINUTES = 10;
const LOCKOUT_MINUTES = 10;

/** The literal target used for the shared admin PIN, which has no agent id. */
export const ADMIN_TARGET = "admin";

export type LockoutState = { lockedUntil: Date } | null;

/**
 * Whether this target is currently locked out.
 *
 * Called before the PIN is checked, so a locked-out attacker isn't even
 * told whether their guess was right.
 */
export async function checkLockout(target: string): Promise<LockoutState> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marathon_pin_attempts")
    .select("locked_until")
    .eq("target", target)
    .maybeSingle();
  if (error) console.error("checkLockout failed:", error);

  if (!data?.locked_until) return null;
  const lockedUntil = new Date(data.locked_until);
  return lockedUntil > new Date() ? { lockedUntil } : null;
}

/**
 * Records a wrong PIN, and locks the target if there have been too many.
 *
 * The window rolls: failures older than WINDOW_MINUTES don't count, so
 * an agent who mistypes once a day never accumulates a lockout.
 */
export async function recordFailure(target: string): Promise<LockoutState> {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: existing } = await supabase
    .from("marathon_pin_attempts")
    .select("failed_count, window_started_at")
    .eq("target", target)
    .maybeSingle();

  const windowStart = existing ? new Date(existing.window_started_at) : now;
  const windowExpired = now.getTime() - windowStart.getTime() > WINDOW_MINUTES * 60_000;

  const failedCount = existing && !windowExpired ? existing.failed_count + 1 : 1;
  const locked = failedCount >= MAX_FAILURES;
  const lockedUntil = locked ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : null;

  await supabase.from("marathon_pin_attempts").upsert(
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

  return lockedUntil ? { lockedUntil } : null;
}

/** A correct PIN wipes the slate — nothing to carry forward. */
export async function clearFailures(target: string) {
  const supabase = createAdminClient();
  await supabase.from("marathon_pin_attempts").delete().eq("target", target);
}

// The lockout wording lives in ./pin (pure, tested); re-exported here so
// the rate-limit module remains the one place callers look for lockout
// behaviour.
export { lockoutMessage } from "./pin";
