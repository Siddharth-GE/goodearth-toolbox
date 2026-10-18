/**
 * A house's work drawn as a wave along the project's stages; height is open work per stage.
 * Height is a COUNT of open trails, not expected days, so one 40-day activity can't tower over five approvals.
 * Queued work counts a third of a running trail: flat means finished, full means picked up.
 * Each stage is drawn inside its own span, so nothing cumulative grows from the left (see schedule.ts).
 * Heights are normalised across every villa on a project page. Pure.
 */

import type { PlannedStage } from "./schedule";

export type WaveTrail = {
  projectStageId: string | null;
  isFinished: boolean;
  isStuck: boolean;
  isQueued: boolean;
  isWithClient?: boolean;
};

export type WaveStageBand = {
  stageId: string;
  name: string;
  x0: number;
  x1: number;
  open: number;
  queued: number;
  stuck: number;
  /** Open, with the client, and not also cold — cold is the louder fact. */
  withClient: number;
  finished: number;
  total: number;
  amp: number;
};

export type WaveMarker = {
  x: number;
  y: number;
  kind: "stuck" | "withClient";
  count: number;
};

export type WaveStatus = "stuck" | "withClient" | "moving" | "waiting" | "complete" | "quiet";

export type WaveModel = {
  bands: WaveStageBand[];
  /** Control points in 0–1, y measured up from the baseline. Includes both ends. */
  points: { x: number; y: number }[];
  markers: WaveMarker[];
  status: WaveStatus;
  label: string;
  /** Where the plan says today is, 0–1. Null when the project has no start date. */
  planX: number | null;
  /** Open trails filed under no stage — they have no honest place on the wave. */
  unfiledOpen: number;
  unfiledStuck: number;
};

/** Queued work is real but nobody has picked it up: a low swell, not a hump. */
const QUEUED_WEIGHT = 0.3;

/** One open trail must always be visible, even beside a villa with ten. */
const MIN_VISIBLE_AMP = 0.18;

function loadOf(trails: readonly WaveTrail[]): number {
  let open = 0;
  let queued = 0;
  for (const t of trails) {
    if (t.isFinished) continue;
    if (t.isQueued) queued += 1;
    else open += 1;
  }
  return open + QUEUED_WEIGHT * queued;
}

/** The height that counts as "full", shared by every wave on a page: the busiest villa sets the ceiling. */
export function waveAmpUnit(groups: readonly (readonly WaveTrail[])[]): number {
  let max = 0;
  for (const g of groups) {
    // Per stage, not per villa, so work spread over five stages doesn't flatten the page.
    const perStage = new Map<string, WaveTrail[]>();
    for (const t of g) {
      if (t.projectStageId === null) continue;
      const list = perStage.get(t.projectStageId);
      if (list) list.push(t);
      else perStage.set(t.projectStageId, [t]);
    }
    for (const list of perStage.values()) max = Math.max(max, loadOf(list));
  }
  return Math.max(1, max);
}

export function buildWave(
  stages: readonly PlannedStage[],
  trails: readonly WaveTrail[],
  opts: { ampUnit: number; planPct: number | null },
): WaveModel | null {
  // No stages, no x-axis: the caller says "set the stages first" instead of a flat line.
  if (stages.length === 0) return null;

  const totalWeeks = stages.reduce((sum, s) => sum + s.weeks, 0);
  const ampUnit = Math.max(1, opts.ampUnit);
  const known = new Set(stages.map((s) => s.id));

  const bands: WaveStageBand[] = stages.map((stage) => {
    const mine = trails.filter((t) => t.projectStageId === stage.id);
    let open = 0;
    let queued = 0;
    let stuck = 0;
    let withClient = 0;
    let finished = 0;
    for (const t of mine) {
      if (t.isFinished) {
        finished += 1;
        continue;
      }
      if (t.isQueued) {
        queued += 1;
        continue;
      }
      open += 1;
      if (t.isStuck) stuck += 1;
      else if (t.isWithClient) withClient += 1;
    }

    const raw = (open + QUEUED_WEIGHT * queued) / ampUnit;
    const amp = raw === 0 ? 0 : Math.min(1, Math.max(MIN_VISIBLE_AMP, raw));

    return {
      stageId: stage.id,
      name: stage.name,
      x0: totalWeeks === 0 ? 0 : stage.weekFrom / totalWeeks,
      x1: totalWeeks === 0 ? 1 : stage.weekTo / totalWeeks,
      open,
      queued,
      stuck,
      withClient,
      finished,
      total: mine.length,
      amp,
    };
  });

  const points = [
    { x: 0, y: 0 },
    ...bands.map((b) => ({ x: (b.x0 + b.x1) / 2, y: b.amp })),
    { x: 1, y: 0 },
  ];

  const markers: WaveMarker[] = [];
  for (const band of bands) {
    const mid = (band.x0 + band.x1) / 2;
    if (band.stuck > 0) {
      markers.push({ x: mid, y: band.amp, kind: "stuck", count: band.stuck });
    }
    if (band.withClient > 0) {
      // Offset when the stage is also cold so two dots stay two.
      markers.push({
        x: band.stuck > 0 ? Math.max(0, mid - 0.025) : mid,
        y: band.amp,
        kind: "withClient",
        count: band.withClient,
      });
    }
  }

  // Trails under no stage (or a deleted one) are counted out loud, not dropped: a calm wave from
  // missing work is the flattering number this tool exists to remove.
  const unfiled = trails.filter(
    (t) => !t.isFinished && (t.projectStageId === null || !known.has(t.projectStageId)),
  );
  const unfiledOpen = unfiled.length;
  const unfiledStuck = unfiled.filter((t) => t.isStuck && !t.isQueued).length;

  const totals = trails.reduce(
    (acc, t) => {
      if (t.isFinished) acc.finished += 1;
      else if (t.isQueued) acc.queued += 1;
      else {
        acc.open += 1;
        if (t.isStuck) acc.stuck += 1;
        if (t.isWithClient) acc.withClient += 1;
      }
      return acc;
    },
    { open: 0, queued: 0, stuck: 0, withClient: 0, finished: 0 },
  );

  const { status, label } = verdictOf(totals, trails.length);

  return {
    bands,
    points,
    markers,
    status,
    label,
    planX: opts.planPct === null ? null : Math.max(0, Math.min(1, opts.planPct / 100)),
    unfiledOpen,
    unfiledStuck,
  };
}

/** The words beside the wave: what is wrong first, then what is happening, then what has ended. */
function verdictOf(
  totals: { open: number; queued: number; stuck: number; withClient: number; finished: number },
  trailCount: number,
): { status: WaveStatus; label: string } {
  if (trailCount === 0) return { status: "quiet", label: "nothing yet" };
  if (totals.stuck > 0) {
    return { status: "stuck", label: `${totals.stuck} stuck` };
  }
  if (totals.open > 0 && totals.withClient === totals.open) {
    return { status: "withClient", label: "with client" };
  }
  if (totals.open > 0) return { status: "moving", label: "moving" };
  if (totals.queued > 0) return { status: "waiting", label: "waiting to start" };
  return { status: "complete", label: "complete" };
}

/** A smooth curve through the control points (Catmull-Rom as béziers, so a hump sits over its stage), clamped to the baseline so it never dips negative. */
export function wavePath(
  points: readonly { x: number; y: number }[],
  w: number,
  h: number,
  pad: number,
): string {
  if (points.length === 0) return "";
  const usable = Math.max(0, h - pad * 2);
  const sx = (x: number) => x * w;
  const sy = (y: number) => h - pad - Math.max(0, Math.min(1, y)) * usable;

  if (points.length === 1) return `M ${sx(points[0].x)} ${sy(points[0].y)}`;

  const floor = h - pad;
  let d = `M ${round(sx(points[0].x))} ${round(sy(points[0].y))}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];

    const c1x = sx(p1.x) + (sx(p2.x) - sx(p0.x)) / 6;
    const c2x = sx(p2.x) - (sx(p3.x) - sx(p1.x)) / 6;
    const c1y = Math.min(floor, sy(p1.y) + (sy(p2.y) - sy(p0.y)) / 6);
    const c2y = Math.min(floor, sy(p2.y) - (sy(p3.y) - sy(p1.y)) / 6);

    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(sx(p2.x))} ${round(sy(p2.y))}`;
  }
  return d;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
