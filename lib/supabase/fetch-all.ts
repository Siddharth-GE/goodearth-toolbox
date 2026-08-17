import "server-only";

import { withRetry } from "./transient";

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
 *
 * THROWS if a page fails, and hands back the rows directly. A page that
 * fails for a connection-level reason is retried first (withRetry, in
 * transient.ts) — the throw is for a database that really won't answer,
 * not for one dropped socket. A refusal or a constraint is not retried.
 *
 * It used to return `{ data, error }` with whatever had been read so
 * far. Of roughly seventy call sites, four checked the error; the rest
 * carried on with a partial array — reintroducing, at the point of
 * failure, the exact bug this helper exists to prevent at the point of
 * truncation. A read that is only correct when complete has no sensible
 * half-answer, so there is no longer a way to ask for one: every row, or
 * it raises. Screens land on app/(dashboard)/error.tsx; the two Server
 * Actions that call this catch it themselves, because an action must
 * return an ActionState rather than throw.
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
