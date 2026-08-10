/**
 * The IST day, defined in exactly one place.
 *
 * Vercel runs UTC, Postgres runs UTC, and the office is at +05:30. Every
 * answer this tool gives — days in a leg, whether a push was on time,
 * whether a day counts towards a streak — turns on one definition of
 * "which day was that", and a push at 02:00 IST is the *previous* day in
 * UTC. Getting this wrong is wrong in the other direction for five and a
 * half hours of every single day, which is exactly the kind of bug that
 * looks like flakiness rather than like a bug.
 *
 * ELAPSED DAYS ARE IST CALENDAR-DAY DIFFERENCES, NOT 24-HOUR BLOCKS.
 * Pushed Monday 18:00 and pushed again Tuesday 09:00 is **one day**, not
 * zero. That is how a site team counts, and it is what makes "expected: 2
 * days" mean what a reader assumes it means.
 *
 * This module must agree exactly with the SQL in 0036 §11, which says
 * `(x at time zone 'Asia/Kolkata')::date`. No test can catch a drift
 * between the two, so keep both sides in mind when changing either.
 *
 * Pure: no I/O, no Date.now(). "Now" is always passed in.
 */

/** India has a single, fixed, never-DST offset. That is why this is safe as a constant. */
export const IST_OFFSET_MINUTES = 330;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * The IST calendar day an instant falls on, as "YYYY-MM-DD".
 * Sorts and compares correctly as a plain string, which is the point.
 */
export function istDayKey(when: string | Date): string {
  const ms = (when instanceof Date ? when : new Date(when)).getTime();
  if (Number.isNaN(ms)) throw new Error(`istDayKey: not a valid instant: ${String(when)}`);
  // Shift into IST, then read the UTC calendar fields of the shifted
  // instant — which are the IST calendar fields of the real one.
  return new Date(ms + IST_OFFSET_MINUTES * MS_PER_MINUTE).toISOString().slice(0, 10);
}

/** Whole IST calendar days from one instant to another. Negative if `to` is earlier. */
export function istDaysBetween(from: string | Date, to: string | Date): number {
  return daysBetweenKeys(istDayKey(from), istDayKey(to));
}

/** Whole days between two "YYYY-MM-DD" keys. */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** Move a day key forward (or back, for a negative n). */
export function addDays(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Every day key from `from` to `to` inclusive. Empty if `to` is before `from`. */
export function dayRange(from: string, to: string): string[] {
  const span = daysBetweenKeys(from, to);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, i) => addDays(from, i));
}
