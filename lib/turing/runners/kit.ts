import "server-only";

import type { ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";

import type { Value } from "../catalogue-fields";
import { redirectedTo } from "../redirects";

export type Values = Record<string, Value>;
/** A tool's answer, or Turing's word on what was made ("IND/SAR/0012"), shown beside Saved. */
export type RunResult = ActionState | { saved: string };
export type RowRunner = (values: Values) => Promise<RunResult>;
/** An entry with lines: one call per record, its header and its lines; the result stands for each line. */
export type LinesRunner = { lines: (header: Values, lines: Values[]) => Promise<RunResult> };
export type Runners<K extends string> = Record<K, RowRunner | LinesRunner>;

/**
 * A save that may end in a redirect: the redirect is the save succeeding, and its address is
 * returned so the new record's id can be read from it (`idFrom`).
 */
export async function saving(
  call: () => Promise<ActionState>,
): Promise<{ error: string } | { path: string | null }> {
  try {
    const result = await call();
    return result?.error ? { error: result.error } : { path: null };
  } catch (thrown) {
    const path = redirectedTo(thrown);
    if (path === null) throw thrown;
    return { path };
  }
}

/** A field Claude left out keeps what is there now; one given empty clears it. */
export const given = (values: Values, key: string, now: string | number | null | undefined) =>
  key in values ? String(values[key]) : now === null || now === undefined ? "" : String(now);

type Failure = { error: string };
export const failed = (what: string, error: unknown): Failure => {
  console.error(`turing: ${what} read failed:`, error);
  return { error: "Could not read how things stand now. Try again." };
};

/**
 * One record's columns as they stand, read as the admin. `missing` says what an absent row means:
 * an error naming what is gone, or `null` where no row is a state of its own.
 */
export async function recordNow(
  table: string,
  match: { column: string; id: string },
  columns: string[],
  missing: string | null,
): Promise<{ row: Record<string, unknown> } | Failure> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table as "vendors")
    .select(columns.join(", "))
    .eq(match.column as "id", match.id)
    .maybeSingle();
  if (error) return failed(table, error);
  if (!data) return missing === null ? { row: {} } : { error: missing };
  return { row: data as unknown as Record<string, unknown> };
}
