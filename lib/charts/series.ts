/**
 * ReportResult → chart model: the shaping Recharts is handed, and the
 * half of charting that carries arithmetic — which is why it is pure
 * and tested while the rendering is not (PLAN.md: what needs testing is
 * the data shaping; Recharts' own rendering does not need our tests).
 *
 * Rules the tests lock down:
 * - Nulls stay null — a gap in the line, never a fabricated 0.
 * - Measures of wildly different magnitude are SPLIT into side-by-side
 *   charts rather than seated on one scale. Dual axes are impossible by
 *   construction; this is where the "two charts instead" decision lands.
 * - A meter is one ratio against a limit: measure one over measure two.
 *   It clamps its bar at 100% but reports the real percentage.
 * - Stacked segments from a grouping level fold past eight into
 *   "Other", and only ADDITIVE measures (sum, count) may be merged
 *   across groups — an average of averages is refused with a plain
 *   sentence, never computed wrong.
 */

import type { GroupRow, ReportResult } from "@/lib/reporter/aggregate";
import { measureId, type ReportSpec } from "@/lib/reporter/spec";

import { OTHER_SERIES, assignSlots, measureColors } from "./palette";

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

/** Sum and count merge across groups; the rest do not. */
const ADDITIVE_AGGS = new Set(["sum", "count"]);

/** Above this ratio between the largest and smallest series maxima, one
 * shared scale flattens the smaller series into a line on the floor. */
const MAGNITUDE_SPLIT_RATIO = 100;

function categoryText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function buildChartModel(args: {
  spec: ReportSpec;
  result: ReportResult;
  /** measure id → display label, from the screen's own labelling. */
  measureLabels: Record<string, string>;
  /** field key → display label. */
  fieldLabels: Record<string, string>;
  /** measure ids whose field carries money. */
  moneyMeasures: string[];
}): ChartModel {
  const { spec, result, measureLabels, fieldLabels, moneyMeasures } = args;
  const chart = spec.chart;

  if (!chart) return { kind: "empty", reason: "No chart is configured." };
  if (!result.groups || result.groups.length === 0) {
    return { kind: "empty", reason: "Nothing to chart yet." };
  }

  const money = chart.measures.every((id) => moneyMeasures.includes(id));

  if (chart.type === "meter") {
    return buildMeter(chart.measures, result, measureLabels, money);
  }

  const level = spec.groupBy.indexOf(chart.category);
  const categoryLabel = fieldLabels[chart.category] ?? chart.category;

  // Stacked with two grouping levels and one measure: the axis is the
  // chart's category level and the segments are the OTHER level.
  if (chart.type === "stacked" && spec.groupBy.length === 2 && chart.measures.length === 1) {
    return buildStackedByGroups(chart.measures[0], level, categoryLabel, spec, result, money);
  }

  // Everything else: one point per group at the category's level, one
  // series per measure.
  const points = pointsAtLevel(result.groups, level, chart.measures, spec);
  if (points === null) {
    return {
      kind: "empty",
      reason: `Group by ${categoryLabel} first — this measure cannot be re-totalled across groups.`,
    };
  }

  const colors = measureColors(chart.measures, chart.emphasis);
  const series: ChartSeries[] = chart.measures.map((id) => ({
    id,
    label: measureLabels[id] ?? id,
    color: colors[id],
  }));

  const model: CartesianModel = {
    kind: "cartesian",
    type: chart.type,
    categoryLabel,
    points,
    series,
    money,
  };

  return maybeSplit(model);
}

function buildMeter(
  measures: string[],
  result: ReportResult,
  measureLabels: Record<string, string>,
  money: boolean,
): ChartModel {
  if (measures.length < 2) {
    return {
      kind: "empty",
      reason: "A meter needs two measures — the value, then the limit it runs against.",
    };
  }
  const [valueId, limitId] = measures;
  const value = result.totals[valueId] ?? null;
  const limit = result.totals[limitId] ?? null;
  const pct = value !== null && limit !== null && limit !== 0 ? (value / limit) * 100 : null;
  return {
    kind: "meter",
    valueLabel: measureLabels[valueId] ?? valueId,
    limitLabel: measureLabels[limitId] ?? limitId,
    value,
    limit,
    pct,
    barPct: pct === null ? null : Math.max(0, Math.min(100, pct)),
    money,
  };
}

/**
 * One point per group at `level`, one value per measure. Level 0 reads
 * the outer groups directly. Level 1 merges children sharing an inner
 * key across outers — legal only when every measure is additive;
 * returns null otherwise so the caller can say why in plain English.
 */
function pointsAtLevel(
  groups: GroupRow[],
  level: number,
  measureIds: string[],
  spec: ReportSpec,
): ChartPoint[] | null {
  if (level <= 0) {
    return groups.map((group) => ({
      category: categoryText(group.keys[0]),
      values: Object.fromEntries(measureIds.map((id) => [id, group.measures[id] ?? null])),
    }));
  }

  const additive = measureIds.every((id) => {
    const measure = spec.measures.find((m) => measureId(m) === id);
    return measure !== undefined && ADDITIVE_AGGS.has(measure.agg);
  });
  if (!additive) return null;

  const merged = new Map<string, Record<string, number | null>>();
  const order: string[] = [];
  for (const outer of groups) {
    for (const child of outer.children ?? []) {
      const key = categoryText(child.keys[1]);
      let bucket = merged.get(key);
      if (!bucket) {
        bucket = Object.fromEntries(measureIds.map((id) => [id, null]));
        merged.set(key, bucket);
        order.push(key);
      }
      for (const id of measureIds) {
        const value = child.measures[id] ?? null;
        if (value !== null) bucket[id] = (bucket[id] ?? 0) + value;
      }
    }
  }
  return order.map((key) => ({ category: key, values: merged.get(key)! }));
}

/** Stacked bar where the segments are a grouping level's own values. */
function buildStackedByGroups(
  theMeasure: string,
  categoryLevel: number,
  categoryLabel: string,
  spec: ReportSpec,
  result: ReportResult,
  money: boolean,
): ChartModel {
  const measure = spec.measures.find((m) => measureId(m) === theMeasure);
  if (!measure || !ADDITIVE_AGGS.has(measure.agg)) {
    return {
      kind: "empty",
      reason: "Stacked segments only add up for totals and counts — pick one of those.",
    };
  }

  const groups = result.groups ?? [];
  const axisLevel = categoryLevel <= 0 ? 0 : 1;
  const segmentLevel = axisLevel === 0 ? 1 : 0;

  // Collect segment identities in first-appearance order, then let the
  // palette fold the tail into "Other".
  const segmentIds: string[] = [];
  for (const outer of groups) {
    for (const child of outer.children ?? []) {
      const id = categoryText(child.keys[segmentLevel]);
      if (!segmentIds.includes(id)) segmentIds.push(id);
    }
  }
  const plan = assignSlots(segmentIds);
  const foldedSet = new Set(plan.folded);

  const points: ChartPoint[] = [];
  const pointIndex = new Map<string, ChartPoint>();
  for (const outer of groups) {
    for (const child of outer.children ?? []) {
      const axisKey = categoryText(child.keys[axisLevel]);
      const rawSegment = categoryText(child.keys[segmentLevel]);
      const segment = foldedSet.has(rawSegment) ? OTHER_SERIES : rawSegment;
      let point = pointIndex.get(axisKey);
      if (!point) {
        point = { category: axisKey, values: {} };
        pointIndex.set(axisKey, point);
        points.push(point);
      }
      const value = child.measures[theMeasure] ?? null;
      if (value !== null) point.values[segment] = (point.values[segment] ?? 0) + value;
    }
  }

  return {
    kind: "cartesian",
    type: "stacked",
    categoryLabel,
    points,
    series: plan.series.map(({ id, token }) => ({ id, label: id, color: token })),
    money,
  };
}

/**
 * One shared scale, or several charts. When the largest series' peak is
 * more than MAGNITUDE_SPLIT_RATIO times the smallest's, a shared axis
 * flattens the small one into a floor line, so the model splits into a
 * chart per measure — never a second axis.
 */
function maybeSplit(model: CartesianModel): CartesianModel | SplitModel {
  if (model.series.length < 2) return model;

  const maxima = model.series.map((series) => {
    let max = 0;
    for (const point of model.points) {
      const value = point.values[series.id];
      if (typeof value === "number") max = Math.max(max, Math.abs(value));
    }
    return max;
  });
  const positive = maxima.filter((m) => m > 0);
  if (positive.length < 2) return model;

  const ratio = Math.max(...positive) / Math.min(...positive);
  if (ratio <= MAGNITUDE_SPLIT_RATIO) return model;

  return {
    kind: "split",
    reason:
      "These measures live on very different scales, so each gets its own chart — one shared axis would flatten the smaller one.",
    charts: model.series.map((series) => ({
      kind: "cartesian",
      type: model.type === "stacked" ? "bar" : model.type,
      categoryLabel: model.categoryLabel,
      points: model.points.map((point) => ({
        category: point.category,
        values: { [series.id]: point.values[series.id] ?? null },
      })),
      series: [series],
      money: model.money,
    })),
  };
}
