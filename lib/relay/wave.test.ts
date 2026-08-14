/**
 * The wave. Most of these tests are about the two judgement calls —
 * height is a count of open trails, and queued work is a low swell — plus
 * the degenerate shapes, which are where a drawing lies most easily: a
 * villa with nothing filed must not look identical to a villa that has
 * finished everything.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSchedule } from "./schedule";
import { buildWave, waveAmpUnit, wavePath, type WaveTrail } from "./wave";

const stages = [
  { id: "s1", name: "Design", weeks: 10, sort_order: 10 },
  { id: "s2", name: "Approvals", weeks: 30, sort_order: 20 },
  { id: "s3", name: "Handover", weeks: 10, sort_order: 30 },
];

const START = "2026-01-01";
const at = (day: string) => `${day}T06:30:00.000Z`;

/** The planned stages, as the pages get them. */
const planned = (now = "2026-01-01") => buildSchedule(stages, [], START, at(now)).stages;

const open = (stageId: string | null): WaveTrail => ({
  projectStageId: stageId,
  isFinished: false,
  isStuck: false,
  isQueued: false,
});
const stuck = (stageId: string | null): WaveTrail => ({ ...open(stageId), isStuck: true });
const withClient = (stageId: string | null): WaveTrail => ({
  ...open(stageId),
  isWithClient: true,
});
const queued = (stageId: string | null): WaveTrail => ({ ...open(stageId), isQueued: true });
const done = (stageId: string | null): WaveTrail => ({ ...open(stageId), isFinished: true });

const build = (trails: WaveTrail[], ampUnit = waveAmpUnit([trails]), planPct: number | null = 0) =>
  buildWave(planned(), trails, { ampUnit, planPct });

test("no stages means no wave — there is no honest x-axis", () => {
  assert.equal(buildWave([], [open("s1")], { ampUnit: 1, planPct: 0 }), null);
});

test("stages lay out proportional to their weeks", () => {
  const wave = build([]);
  assert.ok(wave);
  const [design, approvals, handover] = wave.bands;
  assert.deepEqual([design.x0, design.x1], [0, 0.2]);
  assert.deepEqual([approvals.x0, approvals.x1], [0.2, 0.8]);
  assert.deepEqual([handover.x0, handover.x1], [0.8, 1]);
});

test("the wave starts and ends on the baseline", () => {
  const wave = build([open("s2")]);
  assert.ok(wave);
  assert.deepEqual(wave.points[0], { x: 0, y: 0 });
  assert.deepEqual(wave.points[wave.points.length - 1], { x: 1, y: 0 });
  assert.equal(wave.points.length, stages.length + 2);
});

test("a hump sits over its own stage and nowhere else", () => {
  const wave = build([open("s2"), open("s2")]);
  assert.ok(wave);
  const [design, approvals, handover] = wave.bands;
  assert.equal(design.amp, 0, "nothing open in Design");
  assert.equal(handover.amp, 0);
  assert.equal(approvals.amp, 1, "the busiest stage sets the ceiling");
  // The control point for Approvals sits at its midpoint.
  assert.equal(wave.points[2].x, 0.5);
  assert.equal(wave.points[2].y, 1);
});

test("height is a count of open work, not a sum of days", () => {
  const wave = build([open("s1"), open("s1"), open("s1"), open("s2")]);
  assert.ok(wave);
  assert.equal(wave.bands[0].amp, 1, "three open");
  assert.ok(wave.bands[1].amp < wave.bands[0].amp, "one open is lower than three");
});

test("queued work is a low swell, never flat and never full", () => {
  const wave = build([queued("s1"), queued("s1")], 2);
  assert.ok(wave);
  const amp = wave.bands[0].amp;
  assert.ok(amp > 0, "planned work is visible");
  assert.ok(amp < 1, "but nobody has picked it up");
  assert.equal(wave.status, "waiting");
  assert.equal(wave.label, "waiting to start");
});

test("one open trail stays visible beside a much busier villa", () => {
  const busy = [open("s1"), open("s1"), open("s1"), open("s1"), open("s1"), open("s1")];
  const quiet = [open("s2")];
  const unit = waveAmpUnit([busy, quiet]);
  const wave = buildWave(planned(), quiet, { ampUnit: unit, planPct: 0 });
  assert.ok(wave);
  assert.ok(wave.bands[1].amp >= 0.18, "a floor keeps it off the baseline");
  assert.ok(wave.bands[1].amp < 0.5, "but it is clearly the smaller wave");
});

test("the busiest single stage on the page sets the ceiling", () => {
  const spread = [open("s1"), open("s2"), open("s3")];
  const piled = [open("s1"), open("s1")];
  // Spread across three stages is one per stage, so two piled into one
  // stage is the taller wave.
  assert.equal(waveAmpUnit([spread, piled]), 2);
});

test("finished work is a flat line, and says complete", () => {
  const wave = build([done("s1"), done("s2")]);
  assert.ok(wave);
  assert.ok(
    wave.bands.every((b) => b.amp === 0),
    "nothing in flight",
  );
  assert.equal(wave.status, "complete");
  assert.equal(wave.label, "complete");
});

test("nothing filed is a different sentence from everything finished", () => {
  const wave = build([]);
  assert.ok(wave);
  assert.equal(wave.status, "quiet");
  assert.equal(wave.label, "nothing yet");
});

test("a stuck trail marks its stage in red and takes the headline", () => {
  const wave = build([stuck("s2"), open("s1")]);
  assert.ok(wave);
  assert.equal(wave.status, "stuck");
  assert.equal(wave.label, "1 stuck");
  const marker = wave.markers.find((m) => m.kind === "stuck");
  assert.ok(marker);
  assert.equal(marker.x, 0.5, "on the Approvals crest");
  assert.equal(marker.y, wave.bands[1].amp, "sitting on the curve, not floating");
  assert.equal(marker.count, 1);
});

test("stuck counts add up across stages into one headline", () => {
  const wave = build([stuck("s1"), stuck("s2"), stuck("s2")]);
  assert.ok(wave);
  assert.equal(wave.label, "3 stuck");
  assert.equal(wave.markers.filter((m) => m.kind === "stuck").length, 2, "one dot per stage");
});

test("with client reads as with client only when nothing else is moving", () => {
  const all = build([withClient("s1")]);
  assert.ok(all);
  assert.equal(all.status, "withClient");
  assert.equal(all.label, "with client");

  const mixed = build([withClient("s1"), open("s2")]);
  assert.ok(mixed);
  assert.equal(mixed.status, "moving", "some of it is still with us");
});

test("cold beats with client — the louder fact wins", () => {
  const wave = build([stuck("s1"), withClient("s1")]);
  assert.ok(wave);
  assert.equal(wave.status, "stuck");
  const dots = wave.markers.filter((m) => m.x === 0.1 || m.x < 0.1);
  assert.equal(dots.length, 2, "both dots are drawn");
  const amber = wave.markers.find((m) => m.kind === "withClient");
  const red = wave.markers.find((m) => m.kind === "stuck");
  assert.ok(amber && red);
  assert.ok(amber.x < red.x, "the amber dot steps aside so both are visible");
});

test("a cold trail is not double-counted as with client", () => {
  const both: WaveTrail = { ...stuck("s1"), isWithClient: true };
  const wave = build([both]);
  assert.ok(wave);
  assert.equal(wave.bands[0].stuck, 1);
  assert.equal(wave.bands[0].withClient, 0, "cold is the fact that matters");
});

test("unfiled work is counted out loud, not quietly dropped", () => {
  const wave = build([open(null), stuck(null), open("s1")]);
  assert.ok(wave);
  assert.equal(wave.unfiledOpen, 2);
  assert.equal(wave.unfiledStuck, 1);
  assert.equal(wave.label, "1 stuck", "and it still reaches the headline");
});

test("a trail on a deleted stage counts as unfiled rather than vanishing", () => {
  const wave = build([open("gone-stage")]);
  assert.ok(wave);
  assert.equal(wave.unfiledOpen, 1);
  assert.ok(
    wave.bands.every((b) => b.total === 0),
    "it belongs to no band",
  );
});

test("one stage still draws a single hump", () => {
  const one = buildSchedule([stages[0]], [], START, at("2026-01-01")).stages;
  const wave = buildWave(one, [open("s1")], { ampUnit: 1, planPct: 50 });
  assert.ok(wave);
  assert.equal(wave.bands.length, 1);
  assert.deepEqual(wave.points, [
    { x: 0, y: 0 },
    { x: 0.5, y: 1 },
    { x: 1, y: 0 },
  ]);
});

test("today is a position, and absent when the project has no start date", () => {
  const withDate = build([open("s1")], 1, 40);
  assert.ok(withDate);
  assert.equal(withDate.planX, 0.4);

  const noDate = build([open("s1")], 1, null);
  assert.ok(noDate);
  assert.equal(noDate.planX, null, "the stages still lay out; only the marker goes");
});

test("today never runs off either end", () => {
  const early = build([], 1, -20);
  const late = build([], 1, 260);
  assert.equal(early?.planX, 0);
  assert.equal(late?.planX, 1);
});

test("the path passes through its points and never dips below the baseline", () => {
  const wave = build([open("s2"), open("s2")]);
  assert.ok(wave);
  const d = wavePath(wave.points, 600, 72, 6);
  assert.match(d, /^M 0 66/, "starts on the baseline at the left edge");
  assert.match(d, /300 6/, "the crest is the full height at the midpoint");
  // Every y in the path string is inside the drawable box: nothing above
  // the top padding, nothing below the floor.
  const ys = [...d.matchAll(/-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  assert.ok(ys.length > 0);
  for (const y of ys) {
    assert.ok(y >= 0, `y ${y} is above the top of the box`);
    assert.ok(y <= 66, `y ${y} dips below the baseline`);
  }
});

test("an empty wave is a straight line on the baseline", () => {
  const wave = build([]);
  assert.ok(wave);
  const d = wavePath(wave.points, 600, 72, 6);
  const ys = [...d.matchAll(/-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  for (const y of ys) assert.equal(y, 66);
});
