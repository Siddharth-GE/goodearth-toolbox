// The contract between the catalogue search endpoint
// (app/api/catalogue/route.ts) and the picker that calls it. Types only —
// no imports — so a Client Component can use it without dragging any
// server code into the browser bundle.

export type CatalogueItem = {
  id: string;
  code: string | null;
  name: string;
  /** Flattened from the brands embed by the route handler. */
  brand_name: string | null;
  thumb_url: string | null;
  indicative_price: number | null;
  default_uom: string;
  is_provisional: boolean;
};

export type CatalogueSearchResult = {
  items: CatalogueItem[];
  total: number;
  pageCount: number;
};

export const CATALOGUE_PAGE_SIZE = 30;

/**
 * The `or(...)` filter for a catalogue search, with the term quoted so it
 * cannot be read as filter syntax.
 *
 * WHY THIS IS A FUNCTION AND NOT TWO LINES IN THE ROUTE. PostgREST's `or`
 * takes a comma-separated list of clauses in a URL parameter, so an
 * unquoted user term is being spliced into a small language. The route
 * used to strip `,` `(` `)` from the term first, and stripping the comma
 * was the only thing stopping a second clause being introduced — three
 * characters of defence, with the search term's meaning quietly changed
 * as a side effect (a search for "Basin, wall" searched for something
 * else). No SQL injection was possible, because PostgREST parameterises
 * underneath; the worst case was a malformed filter. It was still the
 * wrong shape.
 *
 * PostgREST's own answer is to DOUBLE-QUOTE the value, which makes every
 * reserved character data — commas, brackets, dots and all. Inside those
 * quotes only `"` and `\` need escaping, with a backslash. So the term is
 * now passed through whole and quoted, which is both safer and more
 * correct: the search finally means what was typed.
 *
 * Pure and exported so it can be tested without a database, which is the
 * only kind of test this repo has.
 */
export function catalogueSearchFilter(search: string, brandIds: string[] = []): string {
  // `%` stays outside nothing — it is inside the quotes, where ilike still
  // reads it as a wildcard. It is the quoting that is doing the work.
  const quoted = `"%${search.replace(/[\\"]/g, "\\$&")}%"`;
  const clauses = [`name.ilike.${quoted}`, `code.ilike.${quoted}`];
  // Brand ids come from the database, not the request, and are uuids — but
  // they are quoted on the same principle rather than on trust.
  if (brandIds.length > 0) {
    clauses.push(`brand_id.in.(${brandIds.map((id) => `"${id}"`).join(",")})`);
  }
  return clauses.join(",");
}
