/**
 * Calendar-date arithmetic on ISO strings ("YYYY-MM-DD", or "YYYY-MM" for a month), read as UTC calendar days
 * so the server's timezone never matters. Pure. The IST day itself (`istDayKey`) lives in lib/relay/day.ts and
 * today's date in lib/format.ts; this file only moves along the calendar.
 */

const MS_PER_DAY = 86_400_000;

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso` — negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utc(toIso) - utc(fromIso)) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return new Date(utc(iso)).getUTCDay();
}

/** The last day of a month, from "YYYY-MM" or any date in it: '2026-02' → '2026-02-28'. */
export function lastDayOfMonth(isoMonthOrDate: string): string {
  const [year, month] = isoMonthOrDate.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/**
 * Move by whole months, keeping the shape given: "2026-01" → "2026-02", "2026-01-31" → "2026-02-28".
 * A day that does not exist in the new month stops at that month's last day (it never spills into the next).
 */
export function shiftMonth(isoMonthOrDate: string, months: number): string {
  const [year, month] = isoMonthOrDate.slice(0, 7).split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const key = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  if (isoMonthOrDate.length <= 7) return key;
  const day = Math.min(
    Number(isoMonthOrDate.slice(8, 10)),
    Number(lastDayOfMonth(key).slice(8, 10)),
  );
  return `${key}-${String(day).padStart(2, "0")}`;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** '2026-10' → 'Oct 2026' (or 'October 2026' with `"long"`). A date in the month works too. */
export function monthLabel(isoMonth: string, style: "short" | "long" = "short"): string {
  if (style === "long") {
    return new Date(`${isoMonth.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const month = Number(isoMonth.slice(5, 7));
  return `${SHORT_MONTHS[month - 1] ?? isoMonth} ${isoMonth.slice(0, 4)}`;
}
