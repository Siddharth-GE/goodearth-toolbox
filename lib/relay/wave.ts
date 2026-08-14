/**
 * A house's work, drawn as a wave.
 *
 * One villa is never one line of work: drawings, procurement and site run
 * in parallel, and a list of trails cannot show that. The wave can. It
 * runs left to right along the project's own stages, and its height at
 * any point is how much open work sits in that stage. Humps are effort in
 * flight. A flat line at the end means everything has landed.
 *
 * Two judgements are baked in:
 *
 *   1. HEIGHT IS A COUNT OF OPEN TRAILS, not a sum of expected days. One
 *      forty-day construction activity would otherwise tower over five
 *      one-day approvals, and the picture would say "Construction is
 *      busy" when what it means is "Construction is slow". The question a
 *      wave answers is "how many things are in flight here".
 *
 *   2. QUEUED WORK COUNTS AT A THIRD of a running trail. A laid-down set
 *      is real, planned work — it must not read as flat, because flat
 *      means finished. It must not read as full height either, because
 *      nobody has picked it up. A low swell is the honest shape.
 *
 * WHY THIS DOES NOT BREAK THE WEIGHTED-TOTAL RULE (see schedule.ts and
 * SchedulePath): each stage's height is drawn INSIDE that stage's own
 * span on the x-axis. Nothing cumulative is ever drawn growing from the
 * left edge. A hump over Construction says "Construction is busy" and
 * says nothing at all about Design, which is exactly the property the
 * per-stage fill was introduced to protect.
 *
 * Heights are normalised across every villa on one project page, so a
 * taller wave really does mean more open work than the villa above it.
 *
 * Pure: no I/O, no dates of its own — the stage windows and "today"
 * arrive already calculated from schedule.ts.
 */

import type { PlannedStage } from "./schedule";

export type WaveTrail = {
  projectStageId: string | null;
  isFinished: boolean;
  isStuck: boolean;
  isQueued: boolean;
  /** The baton is sitting with the client, not with us. */
  isWithClient?: boolean;
};

/** One stage's slice of the wave: where it sits, and what is in it. */
export type WaveStageBand = {
  stageId: string;
  name: string;
  /** 0–1 across the whole project, proportional to the stage's weeks. */
  x0: number;
  x1: number;
  /** Started and not finished. Includes trails sitting with the client. */
  open: number;
  queued: number;
  /** Open and cold. */
  stuck: number;
  /** Open, with the client, and not also cold — cold is the louder fact. */
  withClient: number;
  finished: number;
  total: number;
  /** Height at this stage's midpoint, 0–1. */
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
  /** The words on the right of the card: "2 stuck", "moving", "complete". */
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

/**
 * The height that counts as "full", shared by every wave on one page.
 *
 * Normalising each villa against itself would draw a house with one open
 * trail exactly as tall as a house with fifteen, which is the opposite of
 * one glance. The busiest villa sets the ceiling and everyone else is
 * drawn against it.
 */
export function waveAmpUnit(groups: readonly (readonly WaveTrail[])[]): number {
  let max = 0;
  for (const g of groups) {
    // Per stage, not per villa: the ceiling is the busiest single stage,
    // so a villa with work spread across five stages does not flatten
    // everyone else on the page.
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
  // No stages means no x-axis. There is no honest wave to draw, and the
  // caller shows "set the stages first" instead of a flat line that would
  // read as "nothing to do".
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
      // Offset when the same stage is also cold, so two dots on one crest
      // stay two dots.
      markers.push({
        x: band.stuck > 0 ? Math.max(0, mid - 0.025) : mid,
        y: band.amp,
        kind: "withClient",
        count: band.withClient,
      });
    }
  }

  // Trails filed under no stage, or under a stage that has since been
  // deleted, cannot sit anywhere honest on this axis. They are counted
  // out loud instead of quietly dropped — a wave that looks calm because
  // work is missing from it is the exact flattering number this tool
  // exists to remove.
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

/**
 * The words beside the wave, in the order a reader needs them: what is
 * wrong first, what is happening second, what has ended last.
 */
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

/**
 * The wave itself: a smooth curve through the control points.
 *
 * Catmull-Rom converted to cubic béziers, which is the standard way to
 * get a curve that actually passes through its points rather than near
 * them — a hump must sit over its own stage, not drift into the next one.
 *
 * The control points are clamped to the baseline. Without that, a tall
 * hump beside an empty stage makes the curve dip below zero on the way
 * down, drawing negative work.
 */
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
    // Clamped at the baseline: the curve may flatten, never go negative.
    const c1y = Math.min(floor, sy(p1.y) + (sy(p2.y) - sy(p0.y)) / 6);
    const c2y = Math.min(floor, sy(p2.y) - (sy(p3.y) - sy(p1.y)) / 6);

    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(sx(p2.x))} ${round(sy(p2.y))}`;
  }
  return d;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
