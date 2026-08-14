/**
 * The sign-in lockout arithmetic — pure, so it can be tested without a
 * database (the house rule), mirroring lib/marathon/pin.ts. This file
 * may import nothing.
 *
 * The numbers copy the kiosk's (0015): ten wrong attempts inside a
 * rolling ten-minute window is far more slack than an honest mistake
 * needs, and still turns a scripted guess into weeks. Here the target is
 * an email address rather than an agent id, and the same limits guard
 * three different steps: the password, the emailed code, and reset
 * requests (where "failure" is simply "another email asked for" — the
 * limit is what stops a prankster hosing a colleague's inbox).
 */

export const MAX_FAILURES = 10;
export const WINDOW_MINUTES = 10;
export const LOCKOUT_MINUTES = 10;

export type AttemptRow = {
  failed_count: number;
  window_started_at: string;
};

export type NextAttempt = {
  /** What to store: 0 when this attempt triggered a lockout (the next
   * lockout needs another full run of failures). */
  failedCount: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
};

/**
 * Given the stored row (or null on a first failure) and the clock,
 * decide the row to store and whether this failure locks the target.
 * The window rolls: failures older than WINDOW_MINUTES don't count, so
 * someone who mistypes once a day never accumulates a lockout.
 */
export function nextAttempt(existing: AttemptRow | null, now: Date): NextAttempt {
  const windowStart = existing ? new Date(existing.window_started_at) : now;
  const windowExpired = now.getTime() - windowStart.getTime() > WINDOW_MINUTES * 60_000;

  const failedCount = existing && !windowExpired ? existing.failed_count + 1 : 1;
  const locked = failedCount >= MAX_FAILURES;

  return {
    failedCount: locked ? 0 : failedCount,
    windowStartedAt: windowExpired || locked ? now : windowStart,
    lockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : null,
  };
}

/** Plain wording for a locked-out person. Rounded up, so "1 minute" never
 * means "any second now". */
export function lockoutMessage(lockedUntil: Date, now: Date = new Date()) {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
