/**
 * Birthday arithmetic. The edges are the whole point here: a window that
 * wraps the new year, a date that only exists in three years out of four,
 * and the day itself — all three read wrong under the obvious
 * implementation.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  birthdayLabel,
  daysUntilBirthday,
  formatBirthday,
  nextBirthday,
  upcomingBirthdays,
} from "./birthdays";

test("a birthday later this year is that many days away", () => {
  assert.equal(nextBirthday("1990-08-20", "2026-08-14"), "2026-08-20");
  assert.equal(daysUntilBirthday("1990-08-20", "2026-08-14"), 6);
});

test("today's birthday is 0 days away, not 365", () => {
  // The off-by-one that hides a birthday on the one day it matters.
  assert.equal(nextBirthday("1990-08-14", "2026-08-14"), "2026-08-14");
  assert.equal(daysUntilBirthday("1990-08-14", "2026-08-14"), 0);
});

test("a birthday already past this year rolls to next year", () => {
  assert.equal(nextBirthday("1990-03-02", "2026-08-14"), "2027-03-02");
  assert.equal(daysUntilBirthday("1990-03-02", "2026-08-14"), 200);
});

test("the window wraps the new year", () => {
  // A naive month/day comparison puts January behind December and shows
  // an empty list to everyone for the last week of the year.
  assert.equal(daysUntilBirthday("1990-01-03", "2026-12-28"), 6);

  const people = [{ name: "Anu", dateOfBirth: "1990-01-03" }];
  assert.deepEqual(
    upcomingBirthdays(people, "2026-12-28", 30).map((p) => p.name),
    ["Anu"],
  );
});

test("29 February resolves to 1 March in a non-leap year", () => {
  // 2027 is not a leap year. Dropping the date entirely would hide the
  // birthday for three years in four.
  assert.equal(nextBirthday("1992-02-29", "2027-02-25"), "2027-03-01");
  // 2028 is, so it lands on the real date.
  assert.equal(nextBirthday("1992-02-29", "2028-02-25"), "2028-02-29");
});

test("upcomingBirthdays sorts soonest first and drops anyone with no date", () => {
  const people = [
    { name: "Far", dateOfBirth: "1990-09-01" },
    { name: "Unknown", dateOfBirth: null },
    { name: "Soon", dateOfBirth: "1990-08-16" },
    { name: "Today", dateOfBirth: "1990-08-14" },
    { name: "Outside", dateOfBirth: "1990-11-30" },
  ];

  assert.deepEqual(
    upcomingBirthdays(people, "2026-08-14", 30).map((p) => [p.name, p.daysAway]),
    [
      ["Today", 0],
      ["Soon", 2],
      ["Far", 18],
    ],
  );
});

test("the year is never in the formatted birthday", () => {
  assert.equal(formatBirthday("1987-04-03"), "3 April");
  assert.equal(formatBirthday("2001-12-25"), "25 December");
  assert.ok(!formatBirthday("1987-04-03").includes("1987"));
});

test("the label reads like a person wrote it", () => {
  assert.equal(birthdayLabel(0), "Today");
  assert.equal(birthdayLabel(1), "Tomorrow");
  assert.equal(birthdayLabel(6), "In 6 days");
});
