/**
 * The search / filter bar's URL params, made safe before any query sees
 * them (components/ui/list-toolbar.tsx). Pure, so every list's query
 * module can import it and the tests need no database.
 */

/** A real calendar date as YYYY-MM-DD, or undefined — never trusted raw into a query. */
export function dateParam(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  // 2026-02-31 parses to 3 March: only a date that round-trips is real.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

/**
 * The day after a YYYY-MM-DD date (already checked by dateParam). A
 * "to" date on a timestamptz column means "up to the end of that day",
 * which is `lt` the day after — `lte` the date alone would stop at its
 * midnight and drop that whole day's rows. A date column uses plain `lte`.
 */
export function dayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(next.getTime())) return date;
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * A date range on a timestamptz column, in India time: from the start of
 * `from` to the start of the day after `to` (use with gte / lt). UTC
 * bounds would file anything made between midnight and 05:30 IST under
 * the previous day.
 */
export function istDayStart(date: string): string {
  return `${date}T00:00:00+05:30`;
}

export function istDayEndExclusive(date: string): string {
  return `${dayAfter(date)}T00:00:00+05:30`;
}

/**
 * The search box's text, made safe for a PostgREST `or=(…ilike…)` filter:
 * the characters that filter syntax uses (`,` `(` `)` `.` `:`) and the
 * LIKE wildcards are dropped, so a typed comma can never become a second
 * condition. Capped at 80 characters.
 */
export function searchParam(value: string | undefined): string | undefined {
  const cleaned = (value ?? "")
    .replace(/[,().:%_*\\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 80) : undefined;
}

/** A uuid param, or undefined — a filter select's value, checked. */
export function idParam(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

/** The filter methods a PostgREST select builder has — enough to apply
 * one list's filters identically to its page and to its totals. */
export type Filterable<T> = {
  eq(column: string, value: string): T;
  neq(column: string, value: string): T;
  gte(column: string, value: string): T;
  in(column: string, values: string[]): T;
  lt(column: string, value: string): T;
  lte(column: string, value: string): T;
  or(filters: string): T;
};
