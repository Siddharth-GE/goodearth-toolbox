import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/supabase/transient";

import type { Read } from "./read-rules";
import { TURING_SCHEMA } from "./schema.generated";

export type ReadResult =
  | { ok: true; count: number }
  | { ok: true; rows: Record<string, unknown>[]; more: boolean }
  | { ok: false; error: string };

const PAGE = 1000;

/**
 * Runs a checked read as the person asking: the RLS-scoped client, so it returns exactly what
 * they could open by hand. Names were checked against the schema; the table is dynamic, so the
 * typed client is loosened here and nowhere else.
 */
export async function runRead(read: Read): Promise<ReadResult> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const build = (head: boolean) => {
    let query = supabase
      .from(read.table)
      .select(read.columns.join(","), head ? { count: "exact", head: true } : undefined);
    for (const filter of read.filters) query = query.filter(filter.column, filter.op, filter.value);
    return query;
  };

  if (read.countOnly) {
    const { count, error } = await withRetry(() => build(true));
    if (error) return { ok: false, error: error.message };
    return { ok: true, count: count ?? 0 };
  }

  // Pages need a unique tiebreaker, or rows repeat or vanish between them (fetchAll's rule).
  const order = [...read.order];
  const hasId = Object.hasOwn(TURING_SCHEMA[read.table]?.columns ?? {}, "id");
  if (read.limit > PAGE && hasId && !order.some((step) => step.column === "id")) {
    order.push({ column: "id", ascending: true });
  }

  const rows: Record<string, unknown>[] = [];
  // One row past the limit says whether there is more.
  const wanted = read.limit + 1;
  for (let from = 0; from < wanted; from += PAGE) {
    const to = Math.min(from + PAGE, wanted) - 1;
    const { data, error } = await withRetry(() => {
      let query = build(false);
      for (const step of order) query = query.order(step.column, { ascending: step.ascending });
      return query.range(from, to);
    });
    if (error) return { ok: false, error: error.message };
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }

  return { ok: true, rows: rows.slice(0, read.limit), more: rows.length > read.limit };
}
