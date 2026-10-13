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
  roomsTaken,
  weekStart,
  type CalendarBooking,
} from "./calendar";

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
