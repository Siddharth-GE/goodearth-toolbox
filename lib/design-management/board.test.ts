/**
 * The design board's rules. The founder's: a villa sits at the furthest
 * stage that has started, even while an earlier one is being revised.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  eventPhrase,
  historyLines,
  ordinal,
  passTargets,
  placeOf,
  railOf,
  revisingLabel,
  revisionCounts,
  villaHealth,
  type HealthInput,
  type HistoryEvent,
} from "./board";

const TODAY = "2026-10-17";

const STAGES = [
  { id: "design", name: "Design" },
  { id: "permit", name: "Permit" },
  { id: "wd", name: "WD" },
  { id: "str", name: "Structural" },
  { id: "int", name: "Interiors" },
];

test("a villa sits at the furthest stage that has started", () => {
  assert.deepEqual(placeOf(STAGES, []), { index: -1, complete: false });
  assert.equal(placeOf(STAGES, [{ stageId: "design", status: "working" }]).index, 0);
  // Design sent back while WD carries on: it stays at WD.
  assert.equal(
    placeOf(STAGES, [
      { stageId: "design", status: "revising" },
      { stageId: "permit", status: "done" },
      { stageId: "wd", status: "working" },
    ]).index,
    2,
  );
  // Interiors started early, beside Design: it sits at Interiors.
  assert.equal(
    placeOf(STAGES, [
      { stageId: "design", status: "working" },
      { stageId: "int", status: "working" },
    ]).index,
    4,
  );
  // A step taken back to not started does not count.
  assert.equal(
    placeOf(STAGES, [
      { stageId: "design", status: "done" },
      { stageId: "permit", status: "not_started" },
    ]).index,
    0,
  );
  assert.equal(
    placeOf(
      STAGES,
      STAGES.map((stage) => ({ stageId: stage.id, status: "done" })),
    ).complete,
    true,
  );
  // A stage that is not on the board is ignored.
  assert.equal(placeOf(STAGES, [{ stageId: "mep", status: "working" }]).index, -1);
});

test("the rail has a segment per board stage, in order", () => {
  const rail = railOf(STAGES, [
    { stageId: "wd", status: "with_client" },
    { stageId: "design", status: "done" },
    { stageId: "permit", status: "nonsense" },
  ]);
  assert.deepEqual(
    rail.map((segment) => segment.status),
    ["done", "not_started", "with_client", "not_started", "not_started"],
  );
});

test("pass on offers later stages not yet done, the next first", () => {
  const steps = [
    { stageId: "design", status: "done" },
    { stageId: "permit", status: "working" },
    { stageId: "str", status: "done" },
  ];
  assert.deepEqual(
    passTargets(STAGES, steps, "permit").map((stage) => stage.id),
    ["wd", "int"],
  );
  assert.deepEqual(passTargets(STAGES, steps, "int"), []);
  assert.deepEqual(passTargets(STAGES, steps, "mep"), []);
});

const villa = (over: Partial<HealthInput> = {}): HealthInput => ({
  place: { index: 2, complete: false },
  currentStatus: "working",
  revising: false,
  peopleOnCurrent: 2,
  lastTouched: TODAY,
  ...over,
});

test("how a villa is doing", () => {
  const health = (input: HealthInput, actions: { status: string; dueOn: string | null }[] = []) =>
    villaHealth(input, actions, TODAY);
  assert.equal(health(villa({ place: { index: -1, complete: false } })), null);
  // An overdue action outranks a revision.
  assert.equal(
    health(villa({ revising: true }), [{ status: "open", dueOn: "2026-10-01" }]),
    "overdue",
  );
  assert.equal(health(villa(), [{ status: "open", dueOn: null }]), "overdue");
  assert.equal(health(villa({ revising: true })), "revising");
  assert.equal(health(villa({ currentStatus: "revising" })), "revising");
  assert.equal(
    health(villa({ place: { index: 4, complete: true }, currentStatus: "done" })),
    "complete",
  );
  assert.equal(health(villa({ currentStatus: "done" })), "pass_on");
  assert.equal(health(villa({ peopleOnCurrent: 0 })), "nobody");
  assert.equal(health(villa({ lastTouched: "2026-10-02T09:00:00Z" })), "stale");
  assert.equal(health(villa({ lastTouched: "2026-10-03T09:00:00Z" })), "on_track");
  // A done action and one due later leave it on track.
  assert.equal(
    health(villa(), [
      { status: "done", dueOn: "2026-10-01" },
      { status: "open", dueOn: "2026-11-01" },
    ]),
    "on_track",
  );
});

test("revisions are counted and said", () => {
  const counts = revisionCounts([
    { stepId: "a", kind: "status", toStatus: "revising" },
    { stepId: "a", kind: "status", toStatus: "working" },
    { stepId: "a", kind: "status", toStatus: "revising" },
    { stepId: "b", kind: "person_added", toStatus: null },
  ]);
  assert.equal(counts.get("a"), 2);
  assert.equal(counts.get("b"), undefined);
  assert.equal(revisingLabel("Design", 1), "Revising Design");
  assert.equal(revisingLabel("Design", 2), "Revising Design · 2nd time");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), [
    "1st",
    "2nd",
    "3rd",
    "4th",
    "11th",
    "12th",
    "13th",
    "21st",
    "22nd",
  ]);
});

const event = (over: Partial<HistoryEvent>): HistoryEvent => ({
  seq: 1,
  at: "2026-10-17T10:00:00Z",
  kind: "status",
  fromStatus: null,
  toStatus: "working",
  stageName: "Permit",
  personName: null,
  actorId: "anu",
  actorName: "Anu",
  reason: null,
  ...over,
});

test("each move reads as a few words", () => {
  assert.equal(eventPhrase(event({})), "started Permit");
  assert.equal(eventPhrase(event({ fromStatus: "done" })), "opened Permit again");
  assert.equal(eventPhrase(event({ fromStatus: "with_client" })), "Permit back to working");
  assert.equal(eventPhrase(event({ toStatus: "revising" })), "sent Permit back for revision");
  assert.equal(eventPhrase(event({ toStatus: "done" })), "marked Permit done");
  assert.equal(eventPhrase(event({ toStatus: "not_started" })), "took back the start of Permit");
  assert.equal(
    eventPhrase(event({ kind: "person_added", toStatus: null, personName: "Sayooj" })),
    "put Sayooj on Permit",
  );
  assert.equal(
    eventPhrase(event({ kind: "person_removed", toStatus: null, personName: "Sayooj" })),
    "took Sayooj off Permit",
  );
});

test("one move is one line, newest first, with its reason", () => {
  const lines = historyLines([
    event({ seq: 3, toStatus: "working", stageName: "Structural" }),
    event({ seq: 2, fromStatus: "working", toStatus: "done", stageName: "WD" }),
    event({
      seq: 4,
      kind: "person_added",
      toStatus: null,
      personName: "Jiljith",
      stageName: "Structural",
    }),
    event({
      seq: 5,
      at: "2026-10-17T11:00:00Z",
      fromStatus: "done",
      toStatus: "revising",
      stageName: "Design",
      reason: "Client changed the staircase",
    }),
  ]);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].phrases, ["sent Design back for revision"]);
  assert.deepEqual(lines[0].reasons, ["Client changed the staircase"]);
  assert.deepEqual(lines[1].phrases, [
    "marked WD done",
    "started Structural",
    "put Jiljith on Structural",
  ]);
});
