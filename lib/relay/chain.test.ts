/**
 * Replaying a trail's log. The scenarios here are the ones that actually
 * happen on site: a clean run, a bounce, a leg visited twice, a hand-off
 * mid-leg, and a trail that has gone cold.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { projectedFinishDay, replayChain, stintsOf } from "./chain";
import type { ChainEvent, Leg } from "./events";
import { bounceTargets, canBounce, canFinish, canHand, canPush, holderOf } from "./events";

const ANNA = "anna";
const RAVI = "ravi";
const SITA = "sita";

// A leg IS an activity (0043); label is the activity's name snapshotted
// when the leg was written.
const legs: Leg[] = [
  { leg_no: 1, activity_id: "act-1", label: "Design draft", assignee_id: ANNA, expected_days: 3 },
  {
    leg_no: 2,
    activity_id: "act-2",
    label: "Structural check",
    assignee_id: RAVI,
    expected_days: 2,
  },
  {
    leg_no: 3,
    activity_id: "act-3",
    label: "Client sign-off",
    assignee_id: SITA,
    expected_days: 4,
  },
];

/** 10:00 IST on the given August 2026 day. */
const at = (day: number) => `2026-08-${String(day).padStart(2, "0")}T04:30:00.000Z`;

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

const started = (day: number) =>
  ev({
    kind: "started",
    to_leg: 1,
    to_assignee_id: ANNA,
    to_expected_days: 3,
    occurred_at: at(day),
  });

test("a freshly opened trail sits on leg 1 with its first person", () => {
  seq = 0;
  const state = replayChain([started(1)], legs, at(2));

  assert.equal(state.status, "running");
  assert.equal(state.currentLeg, 1);
  assert.equal(state.holderId, ANNA);
  assert.equal(state.daysInLeg, 1);
  assert.equal(state.isStuck, false);
  assert.equal(state.plannedDays, 9);
  assert.equal(state.remainingDays, 9);
});

test("a leg goes cold the day after its allowance runs out", () => {
  seq = 0;
  const onTheLine = replayChain([started(1)], legs, at(4)); // 3 days on a 3-day leg
  assert.equal(onTheLine.daysInLeg, 3);
  assert.equal(onTheLine.isStuck, false, "spending exactly the allowance is not late");

  seq = 0;
  const cold = replayChain([started(1)], legs, at(6)); // 5 days on a 3-day leg
  assert.equal(cold.isStuck, true);
  assert.equal(cold.overBy, 2);
});

test("pushing hands the baton on and takes the next leg's expected days", () => {
  seq = 0;
  const events = [
    started(1),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      actor_id: ANNA,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(3),
    }),
  ];
  const state = replayChain(events, legs, at(4));

  assert.equal(state.currentLeg, 2);
  assert.equal(state.holderId, RAVI);
  assert.equal(state.daysInLeg, 1);
  assert.equal(state.expectedDays, 2);
  assert.equal(state.remainingDays, 6, "legs 2 and 3 are still to come");
});

test("a bounce sends the baton back, and the leg it returns to is counted twice", () => {
  seq = 0;
  const events = [
    started(1),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      actor_id: ANNA,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(3),
    }),
    ev({
      kind: "bounced",
      from_leg: 2,
      to_leg: 1,
      actor_id: RAVI,
      to_assignee_id: ANNA,
      to_expected_days: 3,
      reason: "missing_info",
      note: "Beam sizes missing on sheet 4",
      occurred_at: at(4),
    }),
  ];
  const state = replayChain(events, legs, at(6));

  assert.equal(state.currentLeg, 1);
  assert.equal(state.holderId, ANNA);
  assert.equal(state.bounceCount, 1);

  const legOne = state.legActuals.find((l) => l.legNo === 1)!;
  assert.equal(legOne.visits, 2, "leg 1 has had the baton twice");
  assert.equal(legOne.daysSoFar, 4, "2 days the first time, 2 days so far the second");
  assert.equal(legOne.status, "current");
});

test("a hand-off changes who holds the baton without resetting the clock", () => {
  seq = 0;
  const events = [
    started(1),
    ev({
      kind: "handed",
      from_leg: 1,
      to_leg: 1,
      actor_id: SITA,
      to_assignee_id: RAVI,
      to_expected_days: 3,
      note: "Anna is on leave",
      occurred_at: at(5),
    }),
  ];
  const state = replayChain(events, legs, at(6));

  assert.equal(state.holderId, RAVI, "the baton moved");
  assert.equal(state.currentLeg, 1);
  assert.equal(
    state.daysInLeg,
    5,
    "the clock still runs from when the baton reached the leg, not from the hand-off",
  );
  assert.equal(state.isStuck, true, "a hand-off cannot launder a trail that already went cold");
});

test("finishing closes the trail and clears the holder", () => {
  seq = 0;
  const events = [
    started(1),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(3),
    }),
    ev({
      kind: "pushed",
      from_leg: 2,
      to_leg: 3,
      actor_id: RAVI,
      to_assignee_id: SITA,
      to_expected_days: 4,
      occurred_at: at(4),
    }),
    ev({ kind: "completed", from_leg: 3, actor_id: SITA, occurred_at: at(7) }),
  ];
  const state = replayChain(events, legs, at(20));

  assert.equal(state.status, "finished");
  assert.equal(state.holderId, null);
  assert.equal(state.currentLeg, null);
  assert.equal(state.isStuck, false, "a finished trail is never cold");
  assert.equal(state.daysInLeg, 0);
  assert.equal(state.totalDays, 6, "1st to 7th, and it stops counting when it finished");
  assert.equal(state.finishedAt, at(7));
  assert.ok(state.legActuals.every((l) => l.status === "done"));
});

test("stints record who held what, for how long", () => {
  seq = 0;
  const events = [
    started(1),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(6),
    }),
  ];
  const stints = stintsOf(events, at(7));

  assert.equal(stints.length, 2);
  assert.equal(stints[0].assigneeId, ANNA);
  assert.equal(stints[0].days, 5);
  assert.equal(stints[0].onTime, false, "5 days on a 3-day leg");
  assert.equal(stints[0].open, false);
  assert.equal(stints[1].assigneeId, RAVI);
  assert.equal(stints[1].open, true);
});

test("events are replayed in seq order however they arrive", () => {
  seq = 0;
  const opened = started(1);
  const pushed = ev({
    kind: "pushed",
    from_leg: 1,
    to_leg: 2,
    to_assignee_id: RAVI,
    to_expected_days: 2,
    occurred_at: at(3),
  });
  const forwards = replayChain([opened, pushed], legs, at(4));
  const backwards = replayChain([pushed, opened], legs, at(4));

  assert.deepEqual(backwards.currentLeg, forwards.currentLeg);
  assert.deepEqual(backwards.holderId, forwards.holderId);
  assert.deepEqual(backwards.daysInLeg, forwards.daysInLeg);
});

test("the projected finish spends what is left of the plan", () => {
  seq = 0;
  // Day 2, one day into a 3-day leg 1: 2 days left on it, plus 2 + 4.
  const state = replayChain([started(1)], legs, at(2));
  assert.equal(projectedFinishDay(state, at(2)), "2026-08-10");

  seq = 0;
  const done = replayChain(
    [started(1), ev({ kind: "completed", from_leg: 1, occurred_at: at(2) })],
    [legs[0]],
    at(3),
  );
  assert.equal(projectedFinishDay(done, at(3)), null);
});

test("the buttons a person is offered match where the baton is", () => {
  seq = 0;
  const events = [
    started(1),
    ev({
      kind: "pushed",
      from_leg: 1,
      to_leg: 2,
      to_assignee_id: RAVI,
      to_expected_days: 2,
      occurred_at: at(3),
    }),
  ];
  const last = events[1];
  const ravi = { userId: RAVI, isAdmin: false };
  const anna = { userId: ANNA, isAdmin: false };
  const boss = { userId: "boss", isAdmin: true };

  assert.equal(holderOf(last), RAVI);
  assert.equal(canPush(last, 3, ravi), true);
  assert.equal(canPush(last, 3, anna), false, "not your baton");
  assert.equal(canPush(last, 3, boss), true, "an admin can move any baton");
  assert.equal(canBounce(last, ravi), true);
  assert.equal(canFinish(last, 3, ravi), false, "leg 2 of 3 is not the finish line");
  assert.deepEqual(bounceTargets(last), [1]);
  assert.equal(canHand(last, ravi), false);
  assert.equal(canHand(last, boss), true);
});

test("nothing is offered on leg 1 or after the finish", () => {
  seq = 0;
  const opened = started(1);
  const anna = { userId: ANNA, isAdmin: false };
  assert.equal(canBounce(opened, anna), false, "there is nothing behind leg 1");
  assert.deepEqual(bounceTargets(opened), []);
  assert.equal(canPush(opened, 3, anna), true);

  const done = ev({ kind: "completed", from_leg: 3, actor_id: SITA, occurred_at: at(9) });
  const sita = { userId: SITA, isAdmin: true };
  assert.equal(canPush(done, 3, sita), false);
  assert.equal(canBounce(done, sita), false);
  assert.equal(canFinish(done, 3, sita), false);
  assert.equal(canHand(done, sita), false);
  assert.equal(holderOf(done), null);
});

test("a one-leg trail can be finished but never pushed", () => {
  seq = 0;
  const solo: Leg[] = [
    { leg_no: 1, activity_id: "act-1", label: "Just do it", assignee_id: ANNA, expected_days: 1 },
  ];
  const opened = started(1);
  const anna = { userId: ANNA, isAdmin: false };

  assert.equal(canPush(opened, 1, anna), false);
  assert.equal(canFinish(opened, 1, anna), true);

  const state = replayChain([opened], solo, at(1));
  assert.equal(state.remainingDays, 1);
});
