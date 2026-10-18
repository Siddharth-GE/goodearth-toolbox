/** Birdwing Books' vocabulary: the database's CHECK lists and the words a person reads for each. Imports only the pure lib/dates, so "use server" files and client components can import it. */
import {
  addDays,
  lastDayOfMonth,
  monthLabel as dateMonthLabel,
  shiftMonth as dateShiftMonth,
} from "@/lib/dates";

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

/** 'October 2026'. */
export function monthLabel(month: string): string {
  return dateMonthLabel(month, "long");
}

/** Always a "YYYY-MM", even when handed a full date. */
export function shiftMonth(month: string, by: number): string {
  return dateShiftMonth(month.slice(0, 7), by);
}

export function daysOfMonth(month: string): string[] {
  const count = Number(lastDayOfMonth(month).slice(8, 10));
  return Array.from({ length: count }, (_, index) => addDays(`${month.slice(0, 7)}-01`, index));
}
