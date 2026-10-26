import "server-only";

import type { ActionState } from "@/lib/action-state";
import { listActiveGstRates } from "@/lib/masters/gst-rates";
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
 * A save that ends in a redirect to what it made, under `expected` ("/indents/"): that redirect
 * is the save succeeding, and its address is returned so the new record's id can be read from it
 * (`idFrom`). Any other redirect — a sign-in that lapsed — is thrown on, never taken as saved.
 */
export async function saving(
  call: () => Promise<ActionState>,
  expected: string,
): Promise<{ error: string } | { path: string | null }> {
  try {
    const result = await call();
    return result?.error ? { error: result.error } : { path: null };
  } catch (thrown) {
    const path = redirectedTo(thrown);
    if (path === null || !path.startsWith(expected)) throw thrown;
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
 * Where a record sits, as the screens' site picker sends it: none (general), or a villa of the
 * project — its unit when the plot has one, else the plot. A villa of another project is refused,
 * which the picker never offers.
 */
export async function siteOf(
  projectId: string,
  plotId: string | null,
): Promise<{ plotId: string | null; unitId: string | null } | Failure> {
  if (!plotId) return { plotId: null, unitId: null };
  const plot = await recordNow(
    "plots",
    { column: "id", id: plotId },
    ["project_id"],
    "That villa is gone.",
  );
  if ("error" in plot) return plot;
  if (plot.row.project_id !== projectId) return { error: "That villa is in another project." };
  const unit = await recordNow("units", { column: "plot_id", id: plotId }, ["id"], null);
  if ("error" in unit) return unit;
  return unit.row.id ? { plotId: null, unitId: String(unit.row.id) } : { plotId, unitId: null };
}

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

/**
 * A refusal unless the record's status is `status` now: the screens offer a decision only in its
 * state, and the decisions update by id alone, so one in another state could move it backwards.
 */
export async function unlessStatus(
  table: string,
  id: string,
  status: string,
  refusal: string,
  gone: string,
): Promise<Failure | null> {
  const now = await recordNow(table, { column: "id", id }, ["status"], gone);
  if ("error" in now) return now;
  return now.row.status === status ? null : { error: refusal };
}

const RETIRED_NOUN = {
  vendors: "vendor",
  stores: "store",
  work_items: "work",
  items: "item",
} as const;

/** A vendor, store, work or item retired in Masters is never offered on the screens. */
export async function retired(
  table: keyof typeof RETIRED_NOUN,
  id: string | null,
): Promise<Failure | null> {
  if (!id) return null;
  const what = RETIRED_NOUN[table];
  const now = await recordNow(table, { column: "id", id }, ["is_active"], `That ${what} is gone.`);
  if ("error" in now) return now;
  return now.row.is_active === false ? { error: `That ${what} is retired in Masters.` } : null;
}

/** The first refusal of checks run side by side, or null. */
export async function firstRefusal(checks: Promise<Failure | null>[]): Promise<Failure | null> {
  return (await Promise.all(checks)).find((refusal) => refusal !== null) ?? null;
}

/**
 * A GST % given must be on the active list, as every screen's picker offers — or the one already
 * there (`keeps[i]`, the line's own or Masters'), which the screens keep offering after it is retired.
 */
export async function gstRefused(
  pcts: (number | null)[],
  keeps: (number | null | undefined)[] = [],
): Promise<Failure | null> {
  const asked = pcts.filter(
    (pct, index): pct is number => pct !== null && pct !== (keeps[index] ?? null),
  );
  if (asked.length === 0) return null;
  let rates: number[];
  try {
    rates = (await listActiveGstRates()).map((row) => Number(row.rate));
  } catch (error) {
    return failed("gst_rates", error);
  }
  const off = asked.find((pct) => !rates.includes(pct));
  return off === undefined
    ? null
    : { error: `${off}% is not on the GST list. Pick one of ${rates.join(", ")}.` };
}
