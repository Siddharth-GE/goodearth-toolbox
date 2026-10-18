/**
 * The IST day, defined once: servers run UTC but the office is +05:30, so a 02:00 IST push is the previous UTC day.
 * Elapsed days are IST calendar-day differences, not 24-hour blocks (Monday 18:00 to Tuesday 09:00 is one day).
 * Must agree with 0036 §11 `(x at time zone 'Asia/Kolkata')::date`; no test catches drift. Pure.
 */

import { addDays, daysBetween } from "@/lib/dates";

/** India has a fixed, never-DST offset, so a constant is safe. */
export const IST_OFFSET_MINUTES = 330;

const MS_PER_MINUTE = 60_000;

export function istDayKey(when: string | Date): string {
  const ms = (when instanceof Date ? when : new Date(when)).getTime();
  if (Number.isNaN(ms)) throw new Error(`istDayKey: not a valid instant: ${String(when)}`);
  // Shift into IST, then read the UTC fields of the shifted instant.
  return new Date(ms + IST_OFFSET_MINUTES * MS_PER_MINUTE).toISOString().slice(0, 10);
}

/** Whole IST calendar days from one instant to another. Negative if `to` is earlier. */
export function istDaysBetween(from: string | Date, to: string | Date): number {
  return daysBetween(istDayKey(from), istDayKey(to));
}

export { addDays, daysBetween as daysBetweenKeys };

/** Every day key from `from` to `to` inclusive. Empty if `to` is before `from`. */
export function dayRange(from: string, to: string): string[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, i) => addDays(from, i));
}
