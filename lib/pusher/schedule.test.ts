/**
 * The project schedule. Everything here is calculated from one start
 * date and a list of week counts, so these tests are mostly about the
 * two judgement calls: stages weigh by their length, and a stage in
 * progress earns partial credit.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSchedule, orderStages, slipLabel, type StageTrail } from "./schedule";

const stages = [
  { id: "s1", name: "Design", weeks: 10, sort_order: 10 },
  { id: "s2", name: "Approvals", weeks: 6, sort_order: 20 },
  { id: "s3", name: "Construction", weeks: 40, sort_order: 30 },
  { id: "s4", name: "Handover", weeks: 4, sort_order: 40 },
];

const START = "2026-01-01";
/** Noon IST on a given day, as the instant "now". */
const at = (day: string) => `${day}T06:30:00.000Z`;

const trail = (stageId: string | null, finished = false, stuck = false): StageTrail => ({
  projectStageId: stageId,
  isFinished: finished,
  isStuck: stuck,
});

test("with no start date there is simply no schedule", () => {
  const s = buildSchedule(stages, [], null, at("2026-03-01"));
  assert.equal(s.hasSchedule, false);
  assert.equal(s.verdict, "not started");
  assert.equal(s.stages.length, 0);
  assert.equal(slipLabel(s), "No schedule set yet");
});

test("with no stages there is no schedule either", () => {
  const s = buildSchedule([], [], START, at("2026-03-01"));
  assert.equal(s.hasSchedule, false);
});

test("stage windows are added up from the week counts", () => {
  const s = buildSchedule(stages, [], START, at("2026-01-01"));
  assert.equal(s.totalWeeks, 60);
  assert.equal(s.startDay, "2026-01-01");
  assert.equal(s.endDay, "2027-02-25", "60 weeks after the start");

  const [design, approvals, construction] = s.stages;
  assert.equal(design.startDay, "2026-01-01");
  assert.equal(design.endDay, "2026-03-12", "10 weeks");
  assert.equal(approvals.startDay, "2026-03-12", "picks up where Design ends");
  assert.equal(approvals.endDay, "2026-04-23");
  assert.equal(construction.startDay, "2026-04-23");
});

test("inserting a stage in the middle moves everything after it, by itself", () => {
  const withExtra = [
    ...stages.slice(0, 2),
    { id: "s5", name: "Fire NOC", weeks: 9, sort_order: 25 },
    ...stages.slice(2),
  ];
  const before = buildSchedule(stages, [], START, at("2026-01-01"));
  const after = buildSchedule(withExtra, [], START, at("2026-01-01"));

  assert.equal(after.totalWeeks, before.totalWeeks + 9);
  const constructionBefore = before.stages.find((s) => s.id === "s3")!;
  const constructionAfter = after.stages.find((s) => s.id === "s3")!;
  assert.equal(constructionAfter.weekFrom, constructionBefore.weekFrom + 9);
  assert.notEqual(constructionAfter.startDay, constructionBefore.startDay);
});

test("the current stage is where the PLAN says today is, not where the work is", () => {
  // Week 12 of 60 lands inside Approvals (weeks 10-16), even though no
  // work at all has been done.
  const s = buildSchedule(stages, [], START, at("2026-03-26"));
  assert.equal(s.currentStageId, "s2");
  assert.equal(s.stages.find((x) => x.id === "s1")!.status, "done");
  assert.equal(s.stages.find((x) => x.id === "s2")!.status, "current");
  assert.equal(s.stages.find((x) => x.id === "s3")!.status, "ahead");
});

test("a long stage moves the number more than a short one", () => {
  // Handover is 4 weeks, Construction 40. Finishing all of Handover's
  // trails must not count the same as finishing all of Construction's.
  const handoverDone = buildSchedule(stages, [trail("s4", true)], START, at("2026-01-01"));
  const constructionDone = buildSchedule(stages, [trail("s3", true)], START, at("2026-01-01"));

  assert.equal(handoverDone.actualPct, round((4 / 60) * 100));
  assert.equal(constructionDone.actualPct, round((40 / 60) * 100));
  assert.ok(constructionDone.actualPct > handoverDone.actualPct * 5);
});

test("a stage in progress earns partial credit, so the bar never lurches", () => {
  const half = buildSchedule(
    stages,
    [trail("s1", true), trail("s1", true), trail("s1"), trail("s1")],
    START,
    at("2026-01-01"),
  );
  const design = half.stages.find((s) => s.id === "s1")!;
  assert.equal(design.progress, 0.5);
  assert.equal(design.trailsFinished, 2);
  assert.equal(design.trailsTotal, 4);
  assert.equal(half.actualPct, round(((0.5 * 10) / 60) * 100));
});

test("a stage with no trails counts as no progress, not as done", () => {
  const s = buildSchedule(stages, [], START, at("2026-01-01"));
  assert.equal(s.actualPct, 0);
  assert.ok(s.stages.every((x) => x.progress === 0));
});

test("behind, on track and ahead", () => {
  // 20 weeks elapsed, nothing finished -> 20 weeks behind.
  const behind = buildSchedule(stages, [], START, at("2026-05-21"));
  assert.equal(behind.verdict, "behind");
  assert.ok(behind.slipWeeks > 19);
  assert.match(slipLabel(behind), /weeks behind/);

  // 10 weeks elapsed and Design (10 weeks) fully done -> level.
  const level = buildSchedule(stages, [trail("s1", true)], START, at("2026-03-12"));
  assert.equal(level.verdict, "on track");
  assert.equal(slipLabel(level), "On track");

  // 1 week elapsed but Design already finished -> 9 weeks ahead.
  const ahead = buildSchedule(stages, [trail("s1", true)], START, at("2026-01-08"));
  assert.equal(ahead.verdict, "ahead");
  assert.match(slipLabel(ahead), /ahead/);
});

test("a week either way reads as on track rather than crying wolf", () => {
  // Half a week elapsed, nothing done: real, but not worth alarming over.
  const s = buildSchedule(stages, [], START, at("2026-01-04"));
  assert.ok(s.slipWeeks > 0 && s.slipWeeks <= 1);
  assert.equal(s.verdict, "on track");
});

test("before the start date nothing has slipped yet", () => {
  const s = buildSchedule(stages, [], START, at("2025-11-01"));
  assert.equal(s.verdict, "not started");
  assert.equal(s.planPct, 0);
  assert.equal(slipLabel(s), "Has not started yet");
});

test("past the end the plan stops at 100, not beyond", () => {
  const s = buildSchedule(stages, [], START, at("2028-01-01"));
  assert.equal(s.planPct, 100);
  assert.ok(s.slipWeeks <= s.totalWeeks);
});

test("trails filed under no stage are counted and surfaced", () => {
  const s = buildSchedule(
    stages,
    [trail(null), trail(null), trail("s1", true)],
    START,
    at("2026-01-01"),
  );
  assert.equal(s.unfiledTrails, 2);
  // and they must not quietly count towards progress
  assert.equal(s.stages.find((x) => x.id === "s1")!.trailsTotal, 1);
});

test("stuck trails are reported per stage", () => {
  const s = buildSchedule(
    stages,
    [trail("s3", false, true), trail("s3", false, true), trail("s3", true, true)],
    START,
    at("2026-06-01"),
  );
  const construction = s.stages.find((x) => x.id === "s3")!;
  assert.equal(construction.trailsStuck, 2, "a finished trail is never counted as stuck");
});

test("stages order by sort_order, with a stable tie-break", () => {
  const jumbled = [
    { id: "b", name: "B", weeks: 1, sort_order: 5 },
    { id: "a", name: "A", weeks: 1, sort_order: 5 },
    { id: "c", name: "C", weeks: 1, sort_order: 1 },
  ];
  assert.deepEqual(
    orderStages(jumbled).map((s) => s.id),
    ["c", "a", "b"],
  );
});

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
