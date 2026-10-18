import assert from "node:assert/strict";
import { test } from "node:test";

import { addDays, daysBetween, lastDayOfMonth, monthLabel, shiftMonth, weekdayOf } from "./dates";

test("addDays steps across month ends, year ends and leap days", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2027-01-01", -1), "2026-12-31");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-10-18", 0), "2026-10-18");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-01-01", 365), "2027-01-01");
});

test("daysBetween is to minus from, negative when backwards", () => {
  assert.equal(daysBetween("2026-10-18", "2026-10-18"), 0);
  assert.equal(daysBetween("2026-10-18", "2026-10-25"), 7);
  assert.equal(daysBetween("2026-10-25", "2026-10-18"), -7);
  assert.equal(daysBetween("2026-12-30", "2027-01-02"), 3);
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);
  assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1);
});

test("weekdayOf: 0 is Sunday", () => {
  assert.equal(weekdayOf("2026-10-18"), 0);
  assert.equal(weekdayOf("2026-10-19"), 1);
  assert.equal(weekdayOf("2026-10-24"), 6);
});

test("lastDayOfMonth knows 30, 31 and leap Februaries", () => {
  assert.equal(lastDayOfMonth("2026-01"), "2026-01-31");
  assert.equal(lastDayOfMonth("2026-04"), "2026-04-30");
  assert.equal(lastDayOfMonth("2026-02"), "2026-02-28");
  assert.equal(lastDayOfMonth("2024-02"), "2024-02-29");
  assert.equal(lastDayOfMonth("2100-02"), "2100-02-28");
  assert.equal(lastDayOfMonth("2026-12-05"), "2026-12-31");
});

test("shiftMonth keeps the shape it was given", () => {
  assert.equal(shiftMonth("2026-10", 1), "2026-11");
  assert.equal(shiftMonth("2026-10-15", 1), "2026-11-15");
});

test("shiftMonth crosses year ends in both directions", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-11-10", 3), "2027-02-10");
  assert.equal(shiftMonth("2026-03", -14), "2025-01");
  assert.equal(shiftMonth("2026-05", 0), "2026-05");
  assert.equal(shiftMonth("2026-05", 24), "2028-05");
});

test("shiftMonth stops a day that does not exist at the new month's last day", () => {
  assert.equal(shiftMonth("2026-01-31", 1), "2026-02-28");
  assert.equal(shiftMonth("2024-01-31", 1), "2024-02-29");
  assert.equal(shiftMonth("2026-03-31", -1), "2026-02-28");
  assert.equal(shiftMonth("2026-05-31", 1), "2026-06-30");
  assert.equal(shiftMonth("2026-12-31", -1), "2026-11-30");
  assert.equal(shiftMonth("2024-02-29", 12), "2025-02-28");
});

test("monthLabel reads short by default and long on request", () => {
  assert.equal(monthLabel("2026-10"), "Oct 2026");
  assert.equal(monthLabel("2026-01"), "Jan 2026");
  assert.equal(monthLabel("2025-12"), "Dec 2025");
  assert.equal(monthLabel("2026-10-18"), "Oct 2026");
  assert.equal(monthLabel("2026-10", "long"), "October 2026");
  assert.equal(monthLabel("2026-09-03", "long"), "September 2026");
});
