/**
 * The room calendar's model: whose night each cell is, and the turnover
 * days the housekeeping must know about.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDays,
  buildCalendar,
  daysFrom,
  monthDays,
  packUnplaced,
  roomsTaken,
  unnamedRoomsByDay,
  weekStart,
  type CalendarBooking,
  type UnplacedStay,
} from "./calendar";

const unplaced = (over: Partial<UnplacedStay>): UnplacedStay => ({
  stayId: "u1",
  label: "Tom Boban",
  from: "2026-09-08",
  to: "2026-09-10",
  roomCount: 1,
  status: "checked_out",
  ...over,
});

test("a stay with no room is a bar over its nights, not its departure day", () => {
  const days = monthDays("2026-09");
  const [lane] = packUnplaced([unplaced({})], days);
  assert.equal(lane.length, 1);
  assert.equal(lane[0].start, 7); // the 8th
  assert.equal(lane[0].span, 2); // the 8th and 9th; they leave on the 10th
  assert.equal(lane[0].dayVisit, false);
});

test("overlapping stays take separate rows; back-to-back ones share a row", () => {
  const days = monthDays("2026-09");
  const lanes = packUnplaced(
    [
      unplaced({ stayId: "a", from: "2026-09-08", to: "2026-09-10" }),
      unplaced({ stayId: "b", from: "2026-09-09", to: "2026-09-11" }),
      unplaced({ stayId: "c", from: "2026-09-10", to: "2026-09-12" }),
    ],
    days,
  );
  assert.equal(lanes.length, 2);
  assert.deepEqual(
    lanes.map((lane) => lane.map((bar) => bar.stayId)),
    [["a", "c"], ["b"]],
  );
});

test("a day visit holds its one day; a stay across the month end is cut and says so", () => {
  const days = monthDays("2026-09");
  const lanes = packUnplaced(
    [
      unplaced({ stayId: "meal", from: "2026-09-03", to: "2026-09-03", roomCount: null }),
      unplaced({ stayId: "long", from: "2026-08-31", to: "2026-09-04" }),
      unplaced({ stayId: "late", from: "2026-09-29", to: "2026-10-02" }),
      unplaced({ stayId: "gone", from: "2026-08-28", to: "2026-09-01" }),
    ],
    days,
  );
  const bars = new Map(lanes.flat().map((bar) => [bar.stayId, bar]));
  assert.equal(bars.get("meal")?.dayVisit, true);
  assert.equal(bars.get("meal")?.span, 1);
  assert.equal(bars.get("long")?.continuesBefore, true);
  assert.equal(bars.get("long")?.start, 0);
  assert.equal(bars.get("long")?.span, 3);
  assert.equal(bars.get("late")?.continuesAfter, true);
  assert.equal(bars.get("late")?.span, 2);
  // Left the morning of the 1st: no night in September, so not drawn.
  assert.equal(bars.has("gone"), false);
});

test("the sheet's room counts add up per night; a day visit adds none", () => {
  const days = daysFrom("2026-09-08", 3);
  const lanes = packUnplaced(
    [
      unplaced({ stayId: "a", roomCount: 2 }),
      unplaced({ stayId: "b", from: "2026-09-09", to: "2026-09-11", roomCount: 1 }),
      unplaced({ stayId: "meal", from: "2026-09-09", to: "2026-09-09", roomCount: 3 }),
    ],
    days,
  );
  assert.deepEqual(unnamedRoomsByDay(lanes, days.length), [2, 3, 1]);
});

const booking = (over: Partial<CalendarBooking>): CalendarBooking => ({
  stayId: "s1",
  roomId: "r2",
  from: "2026-11-06",
  to: "2026-11-08",
  isBlock: false,
  status: "confirmed",
  label: "Trial Guest",
  ...over,
});

test("dates step across month and year ends", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(daysFrom("2026-02-27", 3), ["2026-02-27", "2026-02-28", "2026-03-01"]);
  assert.equal(monthDays("2026-02").length, 28);
  assert.equal(monthDays("2028-02").length, 29);
  assert.equal(monthDays("2026-10").at(-1), "2026-10-31");
});

test("a week starts on the Monday", () => {
  assert.equal(weekStart("2026-11-06"), "2026-11-02"); // a Friday
  assert.equal(weekStart("2026-11-02"), "2026-11-02"); // a Monday
  assert.equal(weekStart("2026-11-08"), "2026-11-02"); // a Sunday
});

test("Friday to Sunday holds two nights, and Sunday's night is free", () => {
  const days = daysFrom("2026-11-05", 4);
  const grid = buildCalendar(["r1", "r2"], days, [booking({})]);
  const r2 = grid.get("r2")!;
  assert.equal(r2[0].night, null);
  assert.equal(r2[1].night?.stayId, "s1");
  assert.equal(r2[1].night?.arrives, true);
  assert.equal(r2[2].night?.arrives, false);
  assert.equal(r2[3].night, null);
  assert.equal(r2[3].departingStayId, "s1");
  assert.equal(
    grid.get("r1")!.every((cell) => cell.night === null),
    true,
  );
});

test("a departure and an arrival on the same day is a turnover", () => {
  const days = daysFrom("2026-11-06", 3);
  const grid = buildCalendar(["r2"], days, [
    booking({}),
    booking({ stayId: "s2", from: "2026-11-08", to: "2026-11-09", label: "Next" }),
  ]);
  const sunday = grid.get("r2")![2];
  assert.equal(sunday.night?.stayId, "s2");
  assert.equal(sunday.departingStayId, "s1");
  assert.equal(sunday.turnover, true);
  assert.equal(grid.get("r2")![1].turnover, false);
});

test("a block holds the room but is no stay, and no turnover", () => {
  const days = daysFrom("2026-11-08", 2);
  const grid = buildCalendar(["r2"], days, [
    booking({}),
    booking({ stayId: "b1", from: "2026-11-08", to: "2026-11-10", isBlock: true }),
  ]);
  const sunday = grid.get("r2")![0];
  assert.equal(sunday.night?.isBlock, true);
  assert.equal(sunday.turnover, false);
  assert.equal(roomsTaken(grid, 0), 0);
});

test("rooms taken counts stays across rooms", () => {
  const days = daysFrom("2026-11-06", 1);
  const grid = buildCalendar(["r1", "r2", "r3"], days, [
    booking({ roomId: "r1" }),
    booking({ stayId: "s2", roomId: "r3" }),
  ]);
  assert.equal(roomsTaken(grid, 0), 2);
});
