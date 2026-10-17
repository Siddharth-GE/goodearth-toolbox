import "server-only";

export type PagedResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

// Deliberately loose, so generated DB row types (status: string) flow into narrowed domain rows with one cast here.
type CountedResponse = PromiseLike<{
  data: unknown[] | null;
  count: number | null;
  error: { message: string } | null;
}>;

/**
 * `build` gets the 1-based page and must apply its own `.range()`.
 * A page past the end re-fetches the last real page.
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

/** `,` `(` `)` are or-filter delimiters. Returns null when nothing searchable remains. */
export function cleanSearch(raw: string | undefined): string | null {
  const cleaned = (raw ?? "").replace(/[,()]/g, " ").trim();
  return cleaned || null;
}
