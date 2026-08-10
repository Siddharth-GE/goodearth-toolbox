/**
 * The points economy. The two that matter most are the ones that stop it
 * being farmed: on-time is measured from the snapshot on the previous
 * event, and repeat bounces on the same trail on the same day are worth
 * nothing after the first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChainEvent } from "./events";
import {
  POINTS,
  previewPoints,
  rankFor,
  rankProgress,
  scoreChain,
  since,
  totalsByActor,
} from "./points";

const ANNA = "anna";
const RAVI = "ravi";

const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 7, day, hour - 5, 30)).toISOString(); // hour is IST

let seq = 0;
const ev = (e: Partial<ChainEvent> & Pick<ChainEvent, "kind" | "occurred_at">): ChainEvent => ({
  seq: ++seq,
  from_leg: null,
  to_leg: null,
  actor_id: ANNA,
  to_assignee_id: null,
  to_expected_days: null,
  reason: null,
  note: null,
  ...e,
});

test("an on-time push pays more than a late one", () => {
  seq = 0;
  const onTime = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 3,
      occurred_at: at(1),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(3),
    }),
  ]);
  assert.equal(onTime[0].points, POINTS.pushOnTime);
  assert.equal(onTime[0].onTime, true);

  seq = 0;
  const late = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 3,
      occurred_at: at(1),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(9),
    }),
  ]);
  assert.equal(late[0].points, POINTS.pushLate);
  assert.equal(late[0].onTime, false);
});

test("on time uses the expected days snapshotted when the baton landed", () => {
  // Leg 1 is planned at 3 days but the event that put the baton there
  // recorded 10 — a later edit to the leg row must not change this.
  seq = 0;
  const scored = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 10,
      occurred_at: at(1),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(8),
    }),
  ]);
  assert.equal(scored[0].onTime, true, "7 days against the 10 it was actually given");
});

test("finishing on time is the biggest single award", () => {
  seq = 0;
  const scored = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 4,
      occurred_at: at(1),
    }),
    ev({ kind: "completed", from_leg: 1, actor_id: ANNA, occurred_at: at(3) }),
  ]);
  assert.equal(scored[0].points, POINTS.finishOnTime);
  assert.equal(POINTS.finishOnTime > POINTS.pushOnTime, true);
});

test("an honest bounce pays, and never counts against on-time", () => {
  seq = 0;
  const scored = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 1,
      occurred_at: at(1),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(2),
    }),
    ev({
      kind: "bounced",
      from_leg: 2,
      to_leg: 1,
      actor_id: RAVI,
      to_assignee_id: ANNA,
      to_expected_days: 1,
      reason: "missing_info",
      note: "Sheet 4 is blank",
      occurred_at: at(9),
    }),
  ]);
  const bounce = scored.find((s) => s.kind === "bounced")!;
  assert.equal(bounce.points, POINTS.bounce);
  assert.equal(bounce.onTime, null, "a bounce is a judgement about the work, not the clock");
});

test("bouncing the same trail twice in a day pays only once", () => {
  seq = 0;
  const scored = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 1,
      occurred_at: at(1),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      to_assignee_id: RAVI,
      to_expected_days: 1,
      occurred_at: at(2, 9),
    }),
    ev({
      kind: "bounced",
      from_leg: 2,
      to_leg: 1,
      actor_id: RAVI,
      to_assignee_id: ANNA,
      to_expected_days: 1,
      reason: "rework",
      note: "again",
      occurred_at: at(2, 11),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      actor_id: ANNA,
      to_assignee_id: RAVI,
      to_expected_days: 1,
      occurred_at: at(2, 13),
    }),
    ev({
      kind: "bounced",
      from_leg: 2,
      to_leg: 1,
      actor_id: RAVI,
      to_assignee_id: ANNA,
      to_expected_days: 1,
      reason: "rework",
      note: "still wrong",
      occurred_at: at(2, 15),
    }),
  ]);

  const bounces = scored.filter((s) => s.kind === "bounced");
  assert.equal(bounces.length, 2, "both stay in the log");
  assert.equal(bounces[0].points, POINTS.bounce);
  assert.equal(bounces[1].points, 0, "the second one the same day is worth nothing");
});

test("a bounce the next day pays again", () => {
  seq = 0;
  const scored = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 1,
      occurred_at: at(1),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      to_assignee_id: RAVI,
      to_expected_days: 1,
      occurred_at: at(2, 9),
    }),
    ev({
      kind: "bounced",
      from_leg: 2,
      to_leg: 1,
      actor_id: RAVI,
      to_assignee_id: ANNA,
      to_expected_days: 1,
      reason: "rework",
      note: "a",
      occurred_at: at(2, 11),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      actor_id: ANNA,
      to_assignee_id: RAVI,
      to_expected_days: 1,
      occurred_at: at(3, 9),
    }),
    ev({
      kind: "bounced",
      from_leg: 2,
      to_leg: 1,
      actor_id: RAVI,
      to_assignee_id: ANNA,
      to_expected_days: 1,
      reason: "rework",
      note: "b",
      occurred_at: at(3, 11),
    }),
  ]);
  const bounces = scored.filter((s) => s.kind === "bounced");
  assert.equal(bounces[0].points, POINTS.bounce);
  assert.equal(bounces[1].points, POINTS.bounce);
});

test("an admin hand-off is worth nothing to anybody", () => {
  seq = 0;
  const scored = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 3,
      occurred_at: at(1),
    }),
    ev({
      kind: "handed",
      from_leg: 1,
      to_leg: 1,
      actor_id: "boss",
      to_assignee_id: RAVI,
      to_expected_days: 3,
      note: "Anna is away",
      occurred_at: at(2),
    }),
  ]);
  assert.equal(scored[0].points, 0);
  assert.equal(scored[0].onTime, null);
});

test("a hand-off does not restart the clock for the next push", () => {
  seq = 0;
  const scored = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 2,
      occurred_at: at(1),
    }),
    ev({
      kind: "handed",
      from_leg: 1,
      to_leg: 1,
      actor_id: "boss",
      to_assignee_id: RAVI,
      to_expected_days: 2,
      note: "Anna is away",
      occurred_at: at(6),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      actor_id: RAVI,
      to_assignee_id: ANNA,
      to_expected_days: 1,
      occurred_at: at(7),
    }),
  ]);
  const push = scored.find((s) => s.kind === "pushed")!;
  assert.equal(push.onTime, false, "6 days on a 2-day leg, whoever ended up holding it");
  assert.equal(push.points, POINTS.pushLate);
});

test("totals separate who did what, and on-time ignores bounces", () => {
  seq = 0;
  const scored = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 3,
      occurred_at: at(1),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      actor_id: ANNA,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(2),
    }),
    ev({
      kind: "bounced",
      from_leg: 2,
      to_leg: 1,
      actor_id: RAVI,
      to_assignee_id: ANNA,
      to_expected_days: 3,
      reason: "rework",
      note: "no",
      occurred_at: at(3),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      actor_id: ANNA,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(20),
    }),
  ]);
  const totals = totalsByActor(scored);

  const anna = totals.get(ANNA)!;
  assert.equal(anna.points, POINTS.pushOnTime + POINTS.pushLate);
  assert.equal(anna.moves, 2);
  assert.equal(anna.onTimePct, 50);

  const ravi = totals.get(RAVI)!;
  assert.equal(ravi.points, POINTS.bounce);
  assert.equal(ravi.bounces, 1);
  assert.equal(ravi.onTimePct, null, "a bounce alone gives you no on-time record at all");
});

test("someone who has never moved a baton has no on-time score", () => {
  assert.equal(totalsByActor([]).get(ANNA), undefined);
});

test("ranks climb with the thresholds", () => {
  assert.equal(rankFor(0).rank, "Runner");
  assert.equal(rankFor(99).rank, "Runner");
  assert.equal(rankFor(100).rank, "Pacer");
  assert.equal(rankFor(900).rank, "Flowmaster");
  assert.equal(rankFor(5000).rank, "Flowmaster");
  assert.equal(rankFor(5000).next, null);
  assert.equal(rankFor(90).toNext, 10);
  assert.equal(rankProgress(175), 50, "halfway from 100 to 250");
  assert.equal(rankProgress(5000), 100);
});

test("the preview promises what the score will actually pay", () => {
  assert.deepEqual(previewPoints("push", 2, 3), { onTime: true, points: POINTS.pushOnTime });
  assert.deepEqual(previewPoints("push", 4, 3), { onTime: false, points: POINTS.pushLate });
  assert.deepEqual(previewPoints("finish", 3, 3), { onTime: true, points: POINTS.finishOnTime });
  assert.deepEqual(previewPoints("finish", 9, 3), { onTime: false, points: POINTS.finishLate });
});

test("a window keeps only the days inside it", () => {
  seq = 0;
  const scored = scoreChain("c1", [
    ev({
      kind: "started",
      to_leg: 1,
      to_assignee_id: ANNA,
      to_expected_days: 3,
      occurred_at: at(1),
    }),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(2),
    }),
    ev({
      kind: "pushed",
      from_leg: 2,
      to_leg: 3,
      actor_id: RAVI,
      to_assignee_id: ANNA,
      to_expected_days: 2,
      occurred_at: at(20),
    }),
  ]);
  assert.equal(since(scored, "2026-08-15").length, 1);
  assert.equal(since(scored, "2026-08-01").length, 2);
});
