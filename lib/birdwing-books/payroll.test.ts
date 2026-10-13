/**
 * The salary arithmetic — the laptop app's rule, pinned before anyone
 * leans on it (Sajna's rule: ₹15,000, ₹80/hr OT, ₹80 a room-day,
 * shift 08:30–17:30).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeSalary,
  minutesOf,
  overtimeMinutes,
  ruleForMonth,
  type AttendanceDay,
  type PayRule,
} from "./payroll";

const sajna: PayRule = {
  effectiveFrom: "2026-01-01",
  baseSalary: 15000,
  shiftStart: "08:30",
  shiftEnd: "17:30",
  otRatePerHr: 80,
  roomDayRate: 80,
  guestDayRate: 0,
};

const day = (onDate: string, over: Partial<AttendanceDay> = {}): AttendanceDay => ({
  onDate,
  status: "present",
  inAt: "08:30",
  outAt: "17:30",
  ...over,
});

test("times read as minutes; junk is nothing", () => {
  assert.equal(minutesOf("08:30"), 510);
  assert.equal(minutesOf("17:30:00"), 1050);
  assert.equal(minutesOf("25:00"), null);
  assert.equal(minutesOf(null), null);
});

test("overtime is the time outside the shift, morning and evening", () => {
  assert.equal(overtimeMinutes({ inAt: "07:30", outAt: "18:30" }, "08:30", "17:30"), 120);
  assert.equal(overtimeMinutes({ inAt: "08:30", outAt: "17:30" }, "08:30", "17:30"), 0);
  assert.equal(overtimeMinutes({ inAt: "09:00", outAt: "16:00" }, "08:30", "17:30"), 0);
  // A late night in the kitchen runs past midnight.
  assert.equal(overtimeMinutes({ inAt: "16:00", outAt: "00:30" }, "08:30", "17:30"), 420);
  assert.equal(overtimeMinutes({ inAt: null, outAt: "17:30" }, "08:30", "17:30"), null);
});

test("the rule in force is the latest one started by the month's end", () => {
  const raise = { ...sajna, effectiveFrom: "2026-11-15", baseSalary: 16000 };
  assert.equal(ruleForMonth([sajna, raise], "2026-10-01")?.baseSalary, 15000);
  assert.equal(ruleForMonth([sajna, raise], "2026-11-01")?.baseSalary, 16000);
  assert.equal(ruleForMonth([raise], "2026-10-01"), null);
});

test("Sajna's month: base, two hours' OT, room-days only on days worked", () => {
  const preview = computeSalary({
    rule: sajna,
    days: [
      day("2026-11-02", { inAt: "07:30", outAt: "18:30" }),
      day("2026-11-03"),
      day("2026-11-04", { status: "leave", inAt: null, outAt: null }),
    ],
    occupancy: new Map([
      ["2026-11-02", { rooms: 2, guests: 3 }],
      ["2026-11-03", { rooms: 2, guests: 3 }],
      ["2026-11-04", { rooms: 4, guests: 8 }],
    ]),
  });
  assert.equal(preview.otHours, 2);
  assert.equal(preview.otAmount, 160);
  assert.equal(preview.roomDays, 4);
  assert.equal(preview.roomAmount, 320);
  assert.equal(preview.guestDays, 6);
  assert.equal(preview.guestAmount, 0);
  assert.equal(preview.gross, 15480);
  assert.equal(preview.workedDays, 2);
  assert.equal(preview.leaveDays, 1);
  assert.deepEqual(preview.missingTimes, []);
});

test("a worked day without times earns no overtime and is named", () => {
  const preview = computeSalary({
    rule: sajna,
    days: [
      day("2026-11-05", { inAt: null, outAt: null }),
      day("2026-11-06", { status: "half_day" }),
    ],
    occupancy: new Map(),
  });
  assert.deepEqual(preview.missingTimes, ["2026-11-05"]);
  assert.equal(preview.otHours, 0);
  assert.equal(preview.halfDays, 1);
});

test("a fixed salary (no shift) is the base and nothing else", () => {
  const amal: PayRule = {
    ...sajna,
    baseSalary: 30000,
    shiftStart: null,
    shiftEnd: null,
    roomDayRate: 0,
  };
  const preview = computeSalary({
    rule: amal,
    days: [day("2026-11-02", { inAt: "06:00", outAt: "22:00" })],
    occupancy: new Map([["2026-11-02", { rooms: 4, guests: 8 }]]),
  });
  assert.equal(preview.gross, 30000);
  assert.deepEqual(preview.missingTimes, []);
});
