import "server-only";

export type PagedResult<T> = {
  rows: T[];
  /** Total matching the filters, not the number returned on this page. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

// Structural view of a PostgREST response — deliberately loose, so the
// generated DB row types (status: string) can flow into the narrowed
// domain rows (status: PlotStatus) with one cast here instead of one in
// every caller. The same boundary listItems draws with `as ItemRow[]`.
type CountedResponse = PromiseLike<{
  data: unknown[] | null;
  count: number | null;
  error: { message: string } | null;
}>;

/**
 * The one-page read every masters table screen shares: fetch the
 * requested page with a real database count, and if the page is past
 * the end (stale link, filter just changed) re-fetch the last real page
 * so the screen shows rows instead of a bare "nothing found". Extracted
 * from listItems, which pioneered the shape.
 *
 * `build` gets the 1-based page and must apply its own `.range()` — it
 * owns filters and ordering; this owns the clamping arithmetic.
 */
export async function pagedList<T>(
  build: (page: number) => CountedResponse,
  requestedPage: number,
  pageSize: number,
): Promise<PagedResult<T>> {
  const requested = Math.max(1, Math.floor(requestedPage || 1));
  const first = await build(requested);
  if (first.error) {
    console.error("pagedList failed:", first.error);
    return { rows: [], total: 0, page: requested, pageSize, pageCount: 1 };
  }

  let data = first.data;
  const total = first.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  let page = requested;
  if (requested > pageCount && total > 0) {
    page = pageCount;
    ({ data } = await build(page));
  }

  return { rows: (data ?? []) as T[], total, page, pageSize, pageCount };
}

/**
 * `,` `(` `)` are PostgREST's or-filter delimiters — a stray comma in
 * the search box would otherwise build a malformed filter. Returns null
 * when nothing searchable remains.
 */
export function cleanSearch(raw: string | undefined): string | null {
  const cleaned = (raw ?? "").replace(/[,()]/g, " ").trim();
  return cleaned || null;
}
