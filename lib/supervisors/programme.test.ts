import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildProgramme,
  dayInIndia,
  dayOfStage,
  nowAndNext,
  stageProgress,
  villaHealth,
  type GroupInfo,
  type ProgrammeStage,
  type StageRecord,
} from "./programme";

const group = (id: string, order: number): GroupInfo => ({
  id,
  code: id,
  name: `Stage ${id}`,
  categoryName: "Superstructure",
  order,
});

const GROUPS = [
  group("FD.01", 1),
  group("SS.01", 10),
  group("SS.02", 11),
  group("MEP.02", 50),
  group("LP.01", 40),
];
// Site order differs from the works list: slab conduiting runs before the lintel.
const SEQUENCE = [
  { groupId: "FD.01", position: 10 },
  { groupId: "MEP.02", position: 15 },
  { groupId: "SS.01", position: 20 },
  { groupId: "SS.02", position: 30 },
];

const record = (groupId: string, extra: Partial<StageRecord> = {}): StageRecord => ({
  id: `r-${groupId}`,
  groupId,
  status: "working",
  statusChangedAt: "2026-10-01T05:00:00Z",
  waitingOn: null,
  waitingNote: null,
  startedOn: "2026-10-01",
  finishedOn: null,
  contractorId: null,
  ...extra,
});

test("the programme follows the site sequence, narrowed to the estimate, plus anything already started", () => {
  const all = buildProgramme({
    groups: GROUPS,
    sequence: SEQUENCE,
    estimateGroupIds: null,
    records: [],
  });
  assert.deepEqual(
    all.map((stage) => stage.id),
    ["FD.01", "MEP.02", "SS.01", "SS.02"],
  );
  assert.ok(all.every((stage) => stage.status === "not_started" && stage.record === null));

  const estimated = buildProgramme({
    groups: GROUPS,
    sequence: SEQUENCE,
    estimateGroupIds: new Set(["SS.01", "LP.01"]),
    records: [record("SS.02")],
  });
  // SS.01 from the estimate, SS.02 because labour started it, LP.01 from the estimate though the sequence lacks it.
  assert.deepEqual(
    estimated.map((stage) => [stage.id, stage.status]),
    [
      ["SS.01", "not_started"],
      ["SS.02", "working"],
      ["LP.01", "not_started"],
    ],
  );
});

test("now is working and waiting; next is the first two not started", () => {
  const stages = buildProgramme({
    groups: GROUPS,
    sequence: SEQUENCE,
    estimateGroupIds: null,
    records: [
      record("FD.01", { status: "done", finishedOn: "2026-10-05" }),
      record("MEP.02", { status: "waiting", waitingOn: "material" }),
    ],
  });
  const { now, next } = nowAndNext(stages);
  assert.deepEqual(
    now.map((stage) => stage.id),
    ["MEP.02"],
  );
  assert.deepEqual(
    next.map((stage) => stage.id),
    ["SS.01", "SS.02"],
  );
  assert.equal(dayOfStage({ startedOn: "2026-10-01" }, "2026-10-06"), 6);
  assert.equal(dayOfStage({ startedOn: null }, "2026-10-06"), null);
});

test("next starts after the furthest stage begun; an untouched earlier stage is not next", () => {
  const stages = buildProgramme({
    groups: GROUPS,
    sequence: SEQUENCE,
    estimateGroupIds: null,
    // Marking and conduiting never recorded, block work already running.
    records: [record("SS.01")],
  });
  const { now, next } = nowAndNext(stages);
  assert.deepEqual(
    now.map((stage) => stage.id),
    ["SS.01"],
  );
  assert.deepEqual(
    next.map((stage) => stage.id),
    ["SS.02"],
  );
});

test("a timestamp's day is India's day", () => {
  assert.equal(dayInIndia("2026-10-14T20:00:00Z"), "2026-10-15");
  assert.equal(dayInIndia("2026-10-14T18:00:00+00:00"), "2026-10-14");
  assert.equal(dayInIndia("2026-10-14"), "2026-10-14");
});

const health = (stages: ProgrammeStage[], extra: Partial<Parameters<typeof villaHealth>[0]> = {}) =>
  villaHealth({
    stages,
    lastLabourByGroup: new Map(),
    failedOpenChecklists: 0,
    oldestUnconfirmedDelivery: null,
    today: "2026-10-10",
    ...extra,
  });

const programme = (records: StageRecord[]) =>
  buildProgramme({ groups: GROUPS, sequence: SEQUENCE, estimateGroupIds: null, records });

test("health: first match wins, in the plan's order", () => {
  const waitingLong = record("MEP.02", {
    status: "waiting",
    waitingOn: "client",
    statusChangedAt: "2026-10-05T10:00:00Z",
  });
  const idle = record("SS.01", { startedOn: "2026-10-01" });
  const both = programme([waitingLong, idle]);
  assert.equal(health(both).kind, "waiting");
  assert.equal(health(both).label, "Waiting 5 days");
  assert.match(health(both).detail ?? "", /on client/);

  // Waiting three days is not yet late; a working stage with no labour for five is.
  const shortWait = record("MEP.02", {
    status: "waiting",
    waitingOn: "material",
    statusChangedAt: "2026-10-07T10:00:00Z",
  });
  assert.equal(health(programme([shortWait, idle])).kind, "idle");
  // Past its planned finish comes after a long wait and before no labour.
  const lateStage = programme([shortWait, idle]).find((stage) => stage.id === "SS.01")!;
  const late = health(programme([shortWait, idle]), { late: { stage: lateStage, days: 4 } });
  assert.equal(late.kind, "late");
  assert.equal(late.label, "4 days past its finish");
  assert.equal(health(both, { late: { stage: lateStage, days: 4 } }).kind, "waiting");
  assert.equal(
    health(programme([shortWait, idle]), { lastLabourByGroup: new Map([["SS.01", "2026-10-08"]]) })
      .kind,
    "on_track",
  );

  const working = programme([record("SS.01")]);
  const recent = { lastLabourByGroup: new Map([["SS.01", "2026-10-09"]]) };
  assert.equal(health(working, { ...recent, failedOpenChecklists: 2 }).kind, "failed_check");
  assert.equal(
    health(working, { ...recent, oldestUnconfirmedDelivery: "2026-10-08" }).kind,
    "delivery",
  );
  assert.equal(
    health(working, { ...recent, oldestUnconfirmedDelivery: "2026-10-09" }).kind,
    "on_track",
  );

  assert.equal(health(programme([])).kind, "not_started");
  const allDone = buildProgramme({
    groups: GROUPS,
    sequence: SEQUENCE.slice(0, 1),
    estimateGroupIds: new Set(["FD.01"]),
    records: [record("FD.01", { status: "done", finishedOn: "2026-10-04" })],
  });
  assert.equal(health(allDone).kind, "finished");
});

test("progress sets piece-work against the estimate in the estimate's unit, never mixing units", () => {
  const works = [
    { id: "w1", label: "SS.01.02 Block masonry" },
    { id: "w2", label: "SS.01.03 Curing" },
    { id: "w3", label: "SS.01.04 Scaffolding" },
  ];
  const progress = stageProgress(
    works,
    [{ workItemId: "w1", quantity: 1800, uom: "sqft" }],
    [
      { workItemId: "w1", quantity: 400, uom: "sqft" },
      { workItemId: "w1", quantity: 240, uom: "SQFT" },
      { workItemId: "w1", quantity: 9, uom: "cum" },
      { workItemId: "w2", quantity: 12, uom: "nos" },
      { workItemId: "w3", quantity: null, uom: null },
    ],
  );
  assert.deepEqual(progress, [
    {
      workItemId: "w1",
      label: "SS.01.02 Block masonry",
      logged: 640,
      estimated: 1800,
      uom: "sqft",
    },
    { workItemId: "w2", label: "SS.01.03 Curing", logged: 12, estimated: null, uom: "nos" },
  ]);
});

test("a stage row holding only days or a first plan does not keep a stage in the programme", () => {
  const planned = programme([
    record("LP.01", { status: "not_started", startedOn: null, contractorId: null }),
  ]).filter((stage) => stage.id === "LP.01");
  // With no official estimate every sequence stage is listed; LP.01 is not in the sequence.
  assert.equal(planned.length, 0);
  const hired = programme([
    record("LP.01", { status: "not_started", startedOn: null, contractorId: "c1" }),
  ]).filter((stage) => stage.id === "LP.01");
  assert.equal(hired.length, 1);
});
