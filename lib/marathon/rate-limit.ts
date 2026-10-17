import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { lockoutMessage } from "./pin";

/**
 * Guessing limits for the public kiosk PIN screens: ten wrong tries in ten minutes locks for ten.
 * Every function fails closed: a count it cannot read or write refuses the attempt.
 */
const MAX_FAILURES = 10;
const WINDOW_MINUTES = 10;
const LOCKOUT_MINUTES = 10;

/** The target for the shared admin PIN, which has no agent id. */
export const ADMIN_TARGET = "admin";

export type Refusal = { error: string } | null;

const UNAVAILABLE: Refusal = { error: "Could not check that PIN. Try again." };

/** Called before the PIN is checked, so a locked-out attacker is not told whether a guess was right. */
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
      // Locking resets the counter, so the next lockout needs a fresh run of failures.
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

/** A correct PIN wipes the slate; a failed wipe is logged, not refused. */
export async function clearFailures(target: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("marathon_pin_attempts").delete().eq("target", target);
  if (error) console.error("clearFailures failed:", error);
}
