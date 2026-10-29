// Search and filter URL params, made safe before any query sees them.

/** A real calendar date as YYYY-MM-DD, or undefined — never trusted raw into a query. */
export function dateParam(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  // 2026-02-31 parses to 3 March: only a date that round-trips is real.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

/** The day after a date: a timestamptz "to" date means the end of that day, so use `lt` this (a date column uses `lte`). */
export function dayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(next.getTime())) return date;
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** A date range on a timestamptz column in India time: start of `from` to start of the day after `to` (gte / lt). */
export function istDayStart(date: string): string {
  return `${date}T00:00:00+05:30`;
}

export function istDayEndExclusive(date: string): string {
  return `${dayAfter(date)}T00:00:00+05:30`;
}

/** Search text made safe for a PostgREST `or=(…ilike…)`: its syntax characters and LIKE wildcards dropped, capped at 80. */
export function searchParam(value: string | undefined): string | undefined {
  const cleaned = (value ?? "")
    .replace(/[,().:%_*\\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 80) : undefined;
}

export function idParam(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

/** The filter methods of a select builder, so one list's filters apply to its page and its totals alike. */
export type Filterable<T> = {
  eq(column: string, value: string): T;
  neq(column: string, value: string): T;
  gte(column: string, value: string): T;
  in(column: string, values: string[]): T;
  lt(column: string, value: string): T;
  lte(column: string, value: string): T;
  or(filters: string): T;
  is(column: string, value: null): T;
  not(column: string, operator: string, value: null): T;
};
