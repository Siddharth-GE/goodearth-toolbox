import "server-only";

/**
 * Reads a query to completion, page by page.
 *
 * PostgREST silently caps any un-ranged select at 1,000 rows. For a list
 * on screen that's a display decision and the query should say its own
 * limit (and the screen should say "showing N of M" — see
 * MARATHON_LIST_LIMIT). But some reads are only correct when they are
 * COMPLETE — carry-forward, merge-before-insert, the Settings grants
 * grid — and for those a silent cap is a data-loss bug: the same one
 * this codebase has now shipped four separate times. Those reads go
 * through here.
 *
 * The caller supplies the query as a function of a range, ordered by
 * something with a unique tiebreaker (`.order("id")` at minimum) —
 * without a total order, rows can repeat or vanish between pages.
 */
export async function fetchAll<Row, Err extends { message: string }>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: Err | null }>,
): Promise<{ data: Row[]; error: Err | null }> {
  const PAGE_SIZE = 1000;
  const rows: Row[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }

  return { data: rows, error: null };
}
