import "server-only";

import { withRetry } from "./transient";

/**
 * Reads a query to completion. PostgREST silently caps a select at 1,000 rows, so
 * any read that is only correct when complete comes through here. The query must
 * order by a unique tiebreaker (`.order("id")`) or rows repeat or vanish between
 * pages. Every row or it throws (a dropped connection is retried first): a partial
 * array is the very bug this exists to prevent. Actions catch it themselves.
 */
export async function fetchAll<Row>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const PAGE_SIZE = 1000;
  const rows: Row[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withRetry(() => page(from, from + PAGE_SIZE - 1));
    if (error) {
      console.error("fetchAll page failed:", error);
      throw new Error(`A read that must be complete failed: ${error.message}`, { cause: error });
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }

  return rows;
}
