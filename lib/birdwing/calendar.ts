// Rooms down the side, days across, each cell the NIGHT of that day. A booking holds nights [from, to): the morning of `to`
// the room is free again, so a day with a departure and an arrival is a TURNOVER. Dates are YYYY-MM-DD strings, stepped in UTC.
import { addDays, weekdayOf } from "@/lib/dates";
import type { StayStatus } from "./shared";

export type CalendarBooking = {
  stayId: string;
  roomId: string;
  from: string;
  to: string;
  isBlock: boolean;
  status: StayStatus;
  label: string;
};

export type CalendarNight = {
  stayId: string;
  isBlock: boolean;
  status: StayStatus;
  label: string;
  arrives: boolean;
};

export type CalendarCell = {
  date: string;
  night: CalendarNight | null;
  departingStayId: string | null;
  /** Somebody leaves this morning and somebody arrives this afternoon. */
  turnover: boolean;
};

export { addDays };

export function daysFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

export function monthDays(month: string): string[] {
  const days: string[] = [];
  for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) days.push(day);
  return days;
}

export function weekStart(date: string): string {
  const weekday = weekdayOf(date);
  return addDays(date, -((weekday + 6) % 7));
}

/** One cell per room per day. Overlapping bookings cannot exist (exclusion constraint), so the first found is the only one. */
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

export function roomsTaken(grid: Map<string, CalendarCell[]>, dayIndex: number): number {
  let taken = 0;
  for (const cells of grid.values()) {
    const night = cells[dayIndex]?.night;
    if (night && !night.isBlock) taken += 1;
  }
  return taken;
}

// Stays with no room named: the old sheet counted rooms but never named them. They are drawn below the rooms as bars,
// never guessed into R1/R2 (an invented room would corrupt occupancy and the double-booking guard).

export type UnplacedStay = {
  stayId: string;
  label: string;
  from: string;
  to: string;
  roomCount: number | null;
  status: StayStatus;
};

export type UnplacedBar = {
  stayId: string;
  label: string;
  roomCount: number | null;
  status: StayStatus;
  dayVisit: boolean;
  start: number;
  span: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/** Each room-less stay as a bar over the days in view, packed into as few rows as possible. */
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

/** Rooms the unnamed stays took per day, from the sheet's counts. Printed under "Taken" as an estimate, never added in. */
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
