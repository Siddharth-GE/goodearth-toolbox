/**
 * Sign-in lockout arithmetic, pure and tested. Ten wrong attempts in a rolling ten
 * minutes locks for ten, for the password, the code and reset requests (where it
 * stops a prankster flooding a colleague's inbox).
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

/** The row to store, and whether this failure locks. Old failures roll out of the window. */
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
