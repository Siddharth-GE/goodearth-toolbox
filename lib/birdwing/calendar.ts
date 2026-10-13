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
