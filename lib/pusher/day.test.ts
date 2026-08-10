/**
 * The IST day boundary. These tests exist because the failure mode is
 * silent: every one of them passes trivially if the machine running them
 * happens to be in IST, and every one of them catches a real bug on a
 * UTC CI runner. The instants below are chosen to straddle 18:30 UTC —
 * IST midnight — in both directions.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { addDays, dayRange, daysBetweenKeys, istDayKey, istDaysBetween } from "./day";

test("an instant just before IST midnight is still the earlier day", () => {
  // 18:29 UTC on the 5th = 23:59 IST on the 5th.
  assert.equal(istDayKey("2026-08-05T18:29:00.000Z"), "2026-08-05");
});

test("an instant just after IST midnight is the next day", () => {
  // 18:30 UTC on the 5th = 00:00 IST on the 6th.
  assert.equal(istDayKey("2026-08-05T18:30:00.000Z"), "2026-08-06");
});

test("early-morning IST is the previous day in UTC, and IST wins", () => {
  // 20:30 UTC Tuesday = 02:00 IST Wednesday.
  assert.equal(istDayKey("2026-08-04T20:30:00.000Z"), "2026-08-05");
});

test("a Date and its ISO string agree", () => {
  const iso = "2026-08-05T18:30:00.000Z";
  assert.equal(istDayKey(new Date(iso)), istDayKey(iso));
});

test("an unparseable instant throws rather than answering wrongly", () => {
  assert.throws(() => istDayKey("not a date"));
});

test("evening to next morning is one day, not zero", () => {
  // The rule the whole tool leans on: 18:00 Monday IST -> 09:00 Tuesday
  // IST is a day, because that is how a site team counts.
  const monEvening = "2026-08-03T12:30:00.000Z"; // 18:00 IST Mon
  const tueMorning = "2026-08-04T03:30:00.000Z"; // 09:00 IST Tue
  assert.equal(istDaysBetween(monEvening, tueMorning), 1);
});

test("fifteen hours inside one IST day is zero days", () => {
  const morning = "2026-08-04T03:30:00.000Z"; // 09:00 IST
  const night = "2026-08-04T18:00:00.000Z"; // 23:30 IST same day
  assert.equal(istDaysBetween(morning, night), 0);
});

test("going backwards is negative", () => {
  assert.equal(istDaysBetween("2026-08-06T06:00:00.000Z", "2026-08-04T06:00:00.000Z"), -2);
});

test("day arithmetic crosses month and year ends", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(daysBetweenKeys("2026-02-27", "2026-03-01"), 2); // 2026 is not a leap year
  assert.equal(daysBetweenKeys("2024-02-27", "2024-03-01"), 3); // 2024 is
});

test("a day range includes both ends, and is empty when reversed", () => {
  assert.deepEqual(dayRange("2026-08-04", "2026-08-06"), [
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
  ]);
  assert.deepEqual(dayRange("2026-08-04", "2026-08-04"), ["2026-08-04"]);
  assert.deepEqual(dayRange("2026-08-06", "2026-08-04"), []);
});
