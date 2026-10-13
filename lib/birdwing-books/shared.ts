/**
 * Birdwing Books' vocabulary — the database's CHECK lists and the words a
 * person reads for each. Import-free: "use server" files and client
 * components import it.
 */

export const GRANT = "/birdwing-books";

export const ATTENDANCE_STATUSES = [
  "present",
  "half_day",
  "leave",
  "holiday_leave",
  "absent",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  half_day: "Half day",
  leave: "Leave",
  holiday_leave: "Holiday leave",
  absent: "Absent",
};

/** One letter for the month grid — the words are in the legend and the dialog. */
export const ATTENDANCE_MARKS: Record<AttendanceStatus, string> = {
  present: "P",
  half_day: "½",
  leave: "L",
  holiday_leave: "H",
  absent: "A",
};

export const EXPENSE_STATUSES = ["recorded", "confirmed"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** "YYYY-MM" → "October 2026". */
export function monthLabel(month: string): string {
  return new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "YYYY-MM" stepped by whole months. */
export function shiftMonth(month: string, by: number): string {
  const [year, mon] = month.slice(0, 7).split("-").map(Number);
  const at = new Date(Date.UTC(year, mon - 1 + by, 1));
  return at.toISOString().slice(0, 7);
}
