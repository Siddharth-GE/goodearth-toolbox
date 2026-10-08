/**
 * The search / filter bar's URL params, made safe before any query sees
 * them (components/ui/list-toolbar.tsx). Pure, so every list's query
 * module can import it and the tests need no database.
 */

/** A date param as YYYY-MM-DD, or undefined — never trusted raw into a query. */
export function dateParam(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
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
  lte(column: string, value: string): T;
  or(filters: string): T;
};
