/**
 * A month's salary, kept as the laptop app computed it (plan.md, Birdwing):
 *   total = base + overtime hours × OT rate + room-days × room-day rate
 *         + guest-days × guest-day rate + incentives − deductions (the reviewer's, on confirm)
 * - Overtime is worked time outside the normal shift; breaks fall inside it. A day without
 *   in/out times earns no overtime and is named so the reviewer can add them. No shift in the
 *   rule means a fixed salary.
 * - A room-day is one occupied room on a day the person worked; a guest-day is one guest in the
 *   house (birdwing_occupancy_facts). Leave, holiday leave and absence earn no incentive.
 * - The base is the month's, whole: proration and deductions are the reviewer's to enter.
 * Pure.
 */
import type { AttendanceStatus } from "./shared";
import { lastDayOfMonth } from "@/lib/dates";
import { roundPaise } from "@/lib/line-money";

export type PayRule = {
  effectiveFrom: string;
  baseSalary: number;
  shiftStart: string | null;
  shiftEnd: string | null;
  otRatePerHr: number;
  roomDayRate: number;
  guestDayRate: number;
};

export type AttendanceDay = {
  onDate: string;
  status: AttendanceStatus;
  inAt: string | null;
  outAt: string | null;
};

export type DayOccupancy = { rooms: number; guests: number };

export type SalaryPreview = {
  base: number;
  otHours: number;
  otAmount: number;
  roomDays: number;
  roomAmount: number;
  guestDays: number;
  guestAmount: number;
  gross: number;
  workedDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  /** Days worked with no in/out times while the rule has a shift. */
  missingTimes: string[];
};

const WORKED: readonly AttendanceStatus[] = ["present", "half_day"];

export function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** The rule in force for a month: the latest effective on or before its last day; null if none yet. */
export function ruleForMonth(rules: PayRule[], month: string): PayRule | null {
  const lastDay = lastDayOfMonth(month);
  return (
    [...rules]
      .filter((rule) => rule.effectiveFrom <= lastDay)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0] ?? null
  );
}

/** Minutes worked outside the shift on one day, null when a time is missing. A shift or day running past midnight ends the next morning. */
export function overtimeMinutes(
  day: Pick<AttendanceDay, "inAt" | "outAt">,
  shiftStart: string,
  shiftEnd: string,
): number | null {
  const start = minutesOf(shiftStart);
  let end = minutesOf(shiftEnd);
  const inAt = minutesOf(day.inAt);
  let outAt = minutesOf(day.outAt);
  if (start === null || end === null || inAt === null || outAt === null) return null;
  if (end <= start) end += 24 * 60;
  if (outAt <= inAt) outAt += 24 * 60;
  const morning = Math.max(0, Math.min(start, outAt) - inAt);
  const evening = Math.max(0, outAt - Math.max(end, inAt));
  return morning + evening;
}

export function computeSalary(input: {
  rule: PayRule;
  days: AttendanceDay[];
  occupancy: Map<string, DayOccupancy>;
}): SalaryPreview {
  const { rule, days, occupancy } = input;
  const hasShift = Boolean(rule.shiftStart && rule.shiftEnd);
  let otMinutes = 0;
  let roomDays = 0;
  let guestDays = 0;
  const missingTimes: string[] = [];
  const count = (status: AttendanceStatus) => days.filter((day) => day.status === status).length;

  for (const day of [...days].sort((a, b) => (a.onDate < b.onDate ? -1 : 1))) {
    if (!WORKED.includes(day.status)) continue;
    const occupied = occupancy.get(day.onDate);
    roomDays += occupied?.rooms ?? 0;
    guestDays += occupied?.guests ?? 0;
    if (!hasShift) continue;
    const minutes = overtimeMinutes(day, rule.shiftStart!, rule.shiftEnd!);
    if (minutes === null) missingTimes.push(day.onDate);
    else otMinutes += minutes;
  }

  const otHours = roundPaise(otMinutes / 60);
  const otAmount = roundPaise(otHours * rule.otRatePerHr);
  const roomAmount = roundPaise(roomDays * rule.roomDayRate);
  const guestAmount = roundPaise(guestDays * rule.guestDayRate);
  const base = roundPaise(rule.baseSalary);
  return {
    base,
    otHours,
    otAmount,
    roomDays,
    roomAmount,
    guestDays,
    guestAmount,
    gross: roundPaise(base + otAmount + roomAmount + guestAmount),
    workedDays: count("present"),
    halfDays: count("half_day"),
    leaveDays: count("leave") + count("holiday_leave"),
    absentDays: count("absent"),
    missingTimes,
  };
}
