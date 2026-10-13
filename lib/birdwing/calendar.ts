/**
 * The room calendar, as a pure model: rooms down the side, days across,
 * and each cell the NIGHT of that day in that room.
 *
 * A booking holds nights [from, to): the morning of `to` the room is free
 * again for the afternoon's arrival. So a cell knows three things — whose
 * night it is (a stay, a block, or nobody's), whether somebody arrives
 * that day, and whether somebody leaves that morning. A day with both a
 * departure and an arrival is a TURNOVER: the housekeeping has hours, not
 * a day.
 *
 * Dates are YYYY-MM-DD strings throughout, compared as strings (the ISO
 * form sorts as dates do) and stepped in UTC so no timezone moves a day.
 */
import type { StayStatus } from "./shared";

export type CalendarBooking = {
  stayId: string;
  roomId: string;
  from: string;
  to: string;
  isBlock: boolean;
  status: StayStatus;
  /** The guest's name, or the block's note. */
  label: string;
};

export type CalendarNight = {
  stayId: string;
  isBlock: boolean;
  status: StayStatus;
  label: string;
  /** This is the booking's first night. */
  arrives: boolean;
};

export type CalendarCell = {
  date: string;
  night: CalendarNight | null;
  /** The stay that leaves this room this morning, if any. */
  departingStayId: string | null;
  /** Somebody leaves this morning and somebody arrives this afternoon. */
  turnover: boolean;
};

export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** `count` consecutive days from `start`. */
export function daysFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

/** Every day of a "YYYY-MM" month. */
export function monthDays(month: string): string[] {
  const days: string[] = [];
  for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) days.push(day);
  return days;
}

/** The Monday on or before a date — a week view starts there. */
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/**
 * The grid: for every room, one cell per day. Bookings that overlap in
 * the same room cannot exist (the database's exclusion constraint), so
 * the first booking found for a night is the only one.
 */
export function buildCalendar(
  roomIds: string[],
  days: string[],
  bookings: CalendarBooking[],
): Map<string, CalendarCell[]> {
  const byRoom = new Map<string, CalendarBooking[]>();
  for (const booking of bookings) {
    const list = byRoom.get(booking.roomId) ?? [];
    list.push(booking);
    byRoom.set(booking.roomId, list);
  }

  const grid = new Map<string, CalendarCell[]>();
  for (const roomId of roomIds) {
    const roomBookings = byRoom.get(roomId) ?? [];
    grid.set(
      roomId,
      days.map((date) => {
        const holder = roomBookings.find((booking) => booking.from <= date && date < booking.to);
        const departing = roomBookings.find((booking) => booking.to === date && !booking.isBlock);
        const night: CalendarNight | null = holder
          ? {
              stayId: holder.stayId,
              isBlock: holder.isBlock,
              status: holder.status,
              label: holder.label,
              arrives: holder.from === date,
            }
          : null;
        return {
          date,
          night,
          departingStayId: departing?.stayId ?? null,
          turnover: Boolean(departing && night && night.arrives && !night.isBlock),
        };
      }),
    );
  }
  return grid;
}

/** How many of the rooms are taken on a night, blocks excluded. */
export function roomsTaken(grid: Map<string, CalendarCell[]>, dayIndex: number): number {
  let taken = 0;
  for (const cells of grid.values()) {
    const night = cells[dayIndex]?.night;
    if (night && !night.isBlock) taken += 1;
  }
  return taken;
}

// ---------------------------------------------------------------------
// Stays with no room named
// ---------------------------------------------------------------------
// The old income sheet said how MANY rooms a stay took, never which —
// so its 220 stays have no room to sit in. They are drawn below the
// rooms instead, each as a bar across its nights, and never guessed into
// R1 or R2 (an invented room would feed occupancy and the double-booking
// guard with a fact nobody recorded). A stay booked here without a room
// yet sits in the same rows. A day visit (meals, an event) is one day.

export type UnplacedStay = {
  stayId: string;
  label: string;
  /** Arrival and departure; equal for a day visit. */
  from: string;
  to: string;
  /** The sheet's room count, or null when it charged no room. */
  roomCount: number | null;
  status: StayStatus;
};

export type UnplacedBar = {
  stayId: string;
  label: string;
  roomCount: number | null;
  status: StayStatus;
  dayVisit: boolean;
  /** Index of the first day shown, and how many days the bar covers. */
  start: number;
  span: number;
  /** The stay began before, or runs on after, the days in view. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Each stay with no room, as a bar over the days in view, packed into as
 * few rows as possible (first row it fits, earliest stay first). A stay
 * holds the nights [from, to); a day visit holds its one day.
 */
export function packUnplaced(stays: UnplacedStay[], days: string[]): UnplacedBar[][] {
  if (days.length === 0) return [];
  const first = days[0];
  const last = days[days.length - 1];
  const bars: UnplacedBar[] = [];
  for (const stay of stays) {
    const dayVisit = stay.to <= stay.from;
    const lastDay = dayVisit ? stay.from : addDays(stay.to, -1);
    if (lastDay < first || stay.from > last) continue;
    const startDay = stay.from < first ? first : stay.from;
    const endDay = lastDay > last ? last : lastDay;
    const start = days.indexOf(startDay);
    const end = days.indexOf(endDay);
    if (start < 0 || end < start) continue;
    bars.push({
      stayId: stay.stayId,
      label: stay.label,
      roomCount: stay.roomCount,
      status: stay.status,
      dayVisit,
      start,
      span: end - start + 1,
      continuesBefore: stay.from < first,
      continuesAfter: lastDay > last,
    });
  }
  bars.sort((a, b) => a.start - b.start || b.span - a.span || a.label.localeCompare(b.label));

  const lanes: UnplacedBar[][] = [];
  for (const bar of bars) {
    const lane = lanes.find((row) => {
      const previous = row[row.length - 1];
      return previous.start + previous.span <= bar.start;
    });
    if (lane) lane.push(bar);
    else lanes.push([bar]);
  }
  return lanes;
}

/**
 * Rooms the unnamed stays took on each day in view, from the sheet's room
 * counts — a day visit takes none. The calendar prints it under "Taken"
 * as an estimate, never adds it in.
 */
export function unnamedRoomsByDay(lanes: UnplacedBar[][], dayCount: number): number[] {
  const counts = Array.from({ length: dayCount }, () => 0);
  for (const bar of lanes.flat()) {
    if (bar.dayVisit || !bar.roomCount) continue;
    for (let index = bar.start; index < bar.start + bar.span; index += 1) {
      counts[index] += bar.roomCount;
    }
  }
  return counts.map((count) => Math.round(count * 100) / 100);
}
