/**
 * The chart model every chart is handed. Types only: shared code must not import a tool (lib/reporter/chart-model.ts builds one).
 * Nulls stay null (a gap, never 0); measures of very different size are split into separate charts, never dual axes;
 * a meter clamps its bar at 100% but reports the real percentage.
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
  barPct: number | null;
  money: boolean;
};

export type SplitModel = { kind: "split"; reason: string; charts: CartesianModel[] };

export type EmptyModel = { kind: "empty"; reason: string };

export type ChartModel = CartesianModel | MeterModel | SplitModel | EmptyModel;
