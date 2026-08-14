/**
 * The mirror of the database guard, and the with-client flag.
 *
 * These tests matter most where the mirror could drift from the trigger:
 * a hold is derived from the last event that MOVED the work, which is
 * not always the last event, and a hand-off must not disturb it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canBounce,
  canClientHold,
  canClientReturn,
  canFinish,
  canHand,
  canPush,
  currentLeg,
  holderOf,
  isWithClient,
  lastEvent,
  type ChainEvent,
} from "./events";

const PRIYA = "11111111-1111-1111-1111-111111111111";
const ARUN = "22222222-2222-2222-2222-222222222222";

let seq = 0;
const ev = (kind: ChainEvent["kind"], over: Partial<ChainEvent> = {}): ChainEvent => ({
  seq: ++seq,
  kind,
  from_leg: null,
  to_leg: 2,
  actor_id: PRIYA,
  to_assignee_id: PRIYA,
  to_expected_days: 4,
  reason: null,
  note: null,
  occurred_at: "2026-08-01T06:00:00.000Z",
  ...over,
});

const holder = { userId: PRIYA, isAdmin: false };
const other = { userId: ARUN, isAdmin: false };
const admin = { userId: ARUN, isAdmin: true };

test("a fresh push is not with the client", () => {
  const events = [ev("started", { to_leg: 1 }), ev("pushed", { from_leg: 1, to_leg: 2 })];
  assert.equal(isWithClient(events), false);
});

test("a hold puts the work with the client", () => {
  const events = [ev("started", { to_leg: 1 }), ev("client_held", { from_leg: 1, to_leg: 1 })];
  assert.equal(isWithClient(events), true);
});

test("taking it back clears the flag", () => {
  const events = [
    ev("started", { to_leg: 1 }),
    ev("client_held", { from_leg: 1, to_leg: 1 }),
    ev("client_returned", { from_leg: 1, to_leg: 1 }),
  ];
  assert.equal(isWithClient(events), false);
});

test("a push clears the flag without anyone releasing it", () => {
  const events = [
    ev("started", { to_leg: 1 }),
    ev("client_held", { from_leg: 1, to_leg: 1 }),
    ev("pushed", { from_leg: 1, to_leg: 2 }),
  ];
  assert.equal(isWithClient(events), false, "the baton moved, so the work is back with us");
});

test("a bounce clears it too", () => {
  const events = [
    ev("started", { to_leg: 1 }),
    ev("pushed", { from_leg: 1, to_leg: 2 }),
    ev("client_held", { from_leg: 2, to_leg: 2 }),
    ev("bounced", { from_leg: 2, to_leg: 1, reason: "rework", note: "redo" }),
  ];
  assert.equal(isWithClient(events), false);
});

test("a hand-off does NOT take the work back from the client", () => {
  // The trap: 'handed' is the last event, but it only changes who is
  // accountable. Reading the last event alone would answer false.
  const events = [
    ev("started", { to_leg: 1 }),
    ev("client_held", { from_leg: 1, to_leg: 1 }),
    ev("handed", { from_leg: 1, to_leg: 1, to_assignee_id: ARUN, note: "Priya is away" }),
  ];
  assert.equal(isWithClient(events), true);
  assert.equal(holderOf(lastEvent(events)), ARUN, "and the hand-off still moved the baton");
});

test("a finished trail is never with a client", () => {
  const events = [
    ev("started", { to_leg: 1 }),
    ev("client_held", { from_leg: 1, to_leg: 1 }),
    ev("completed", { from_leg: 1, to_leg: null, to_assignee_id: null, to_expected_days: null }),
  ];
  assert.equal(isWithClient(events), false);
});

test("out-of-order events still answer from the highest seq", () => {
  const started = ev("started", { to_leg: 1 });
  const held = ev("client_held", { from_leg: 1, to_leg: 1 });
  assert.equal(isWithClient([held, started]), true);
});

test("the holder can hand work to the client, a bystander cannot", () => {
  const last = ev("pushed", { from_leg: 1, to_leg: 2 });
  assert.equal(canClientHold(last, holder, false), true);
  assert.equal(canClientHold(last, other, false), false);
  assert.equal(canClientHold(last, admin, false), true, "admins can move any baton");
});

test("you cannot give it to the client twice, or take back what they never had", () => {
  const last = ev("client_held", { from_leg: 2, to_leg: 2 });
  assert.equal(canClientHold(last, holder, true), false);
  assert.equal(canClientReturn(last, holder, true), true);

  const moving = ev("pushed", { from_leg: 1, to_leg: 2 });
  assert.equal(canClientReturn(moving, holder, false), false);
});

test("nothing can be done to a finished trail", () => {
  const done = ev("completed", {
    from_leg: 3,
    to_leg: null,
    to_assignee_id: null,
    to_expected_days: null,
  });
  assert.equal(canClientHold(done, admin, false), false);
  assert.equal(canClientReturn(done, admin, true), false);
});

test("an unopened trail has nothing to hand over", () => {
  assert.equal(canClientHold(null, holder, false), false);
  assert.equal(canClientReturn(null, holder, true), false);
});

test("the old predicates still answer correctly when a hold is the last event", () => {
  // A held trail is still on its leg with its holder, so the ordinary
  // moves stay available — that is the point of the snapshot columns.
  const held = ev("client_held", { from_leg: 2, to_leg: 2 });
  assert.equal(currentLeg(held), 2);
  assert.equal(holderOf(held), PRIYA);
  assert.equal(canPush(held, 3, holder), true);
  assert.equal(canBounce(held, holder), true);
  assert.equal(canFinish(held, 2, holder), true);
  assert.equal(canHand(held, admin), true);
});
