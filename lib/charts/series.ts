/**
 * The chart model: the shape every chart in the toolbox is handed.
 *
 * TYPES ONLY, and that is the point. This file is shared code, so it must
 * not import a tool — the shared UI in components/ui/chart/* consumes
 * these types, and until 2026-08-17 it inherited a dependency on
 * /reporter through them, which meant deleting one tool would have
 * stopped the whole chart design system compiling (AUDIT.md MOD-02).
 *
 * The building of a model from a report lives in the tool that has a
 * report to build it from: lib/reporter/chart-model.ts. Anything else
 * that ever needs to chart brings its own shaping and produces one of
 * these; that is the contract, and it points the right way round.
 *
 * What the shapes encode, all of it enforced by the tests next to
 * whichever module does the building:
 * - Nulls stay null — a gap in the line, never a fabricated 0.
 * - Measures of wildly different magnitude are SPLIT into side-by-side
 *   charts rather than seated on one scale. Dual axes are impossible by
 *   construction.
 * - A meter is one ratio against a limit. It clamps its bar at 100% but
 *   reports the real percentage.
 */

export type ChartSeries = { id: string; label: string; color: string };

/** One category on the axis; one value per series id. Null is a gap. */
export type ChartPoint = { category: string; values: Record<string, number | null> };

export type CartesianModel = {
  kind: "cartesian";
  type: "bar" | "hbar" | "line" | "area" | "stacked";
  categoryLabel: string;
  points: ChartPoint[];
  series: ChartSeries[];
  /** Every charted measure is money — format the axis as rupees. */
  money: boolean;
};

export type MeterModel = {
  kind: "meter";
  valueLabel: string;
  limitLabel: string;
  value: number | null;
  limit: number | null;
  /** The real ratio, uncapped — the caption tells the truth. */
  pct: number | null;
  /** The bar's width, capped at 100. */
  barPct: number | null;
  money: boolean;
};

export type SplitModel = { kind: "split"; reason: string; charts: CartesianModel[] };

export type EmptyModel = { kind: "empty"; reason: string };

export type ChartModel = CartesianModel | MeterModel | SplitModel | EmptyModel;
