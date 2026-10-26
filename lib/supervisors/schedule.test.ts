import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDays,
  describeSlip,
  firstPlanBlocker,
  forecastVilla,
  learnedDays,
  stageDays,
  type ScheduleStage,
  type SequenceRule,
  followsInCircle,
  villaRules,
} from "./schedule";

const TODAY = "2026-11-01";

const stage = (groupId: string, extra: Partial<ScheduleStage> = {}): ScheduleStage => ({
  groupId,
  status: "not_started",
  startedOn: null,
  finishedOn: null,
  days: null,
  pinnedStart: null,
  baselineStart: null,
  baselineFinish: null,
  ...extra,
});

const rule = (
  groupId: string,
  followsGroupId: string | null,
  extra: Partial<SequenceRule> = {},
): SequenceRule => ({
  groupId,
  followsGroupId,
  link: "after",
  waitDays: 0,
  typicalDays: null,
  ...extra,
});

const days = (entries: Record<string, number>) =>
  new Map(
    Object.entries(entries).map(([id, n]) => [
      id,
      { days: n, source: "typical" as const, learnedFrom: null },
    ]),
  );

const forecast = (input: {
  stages: ScheduleStage[];
  sequence: SequenceRule[];
  days: Record<string, number>;
  startOn?: string | null;
  baselined?: boolean;
}) =>
  forecastVilla({
    stages: input.stages,
    sequence: input.sequence,
    startOn: input.startOn === undefined ? "2026-11-02" : input.startOn,
    today: TODAY,
    daysByGroup: days(input.days),
    baselined: input.baselined ?? false,
  });

const byId = (schedule: ReturnType<typeof forecastVilla>, id: string) =>
  schedule.stages.find((entry) => entry.groupId === id)!;

test("addDays crosses months", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-11-02", -2), "2026-10-31");
});

test("a chain: each stage starts the day after the one it follows, wait days added", () => {
  const schedule = forecast({
    stages: [stage("A"), stage("B"), stage("C")],
    sequence: [rule("A", null), rule("B", "A"), rule("C", "B", { waitDays: 3 })],
    days: { A: 5, B: 2, C: 4 },
  });
  assert.deepEqual(
    schedule.stages.map((entry) => [entry.start, entry.finish]),
    [
      ["2026-11-02", "2026-11-06"],
      ["2026-11-07", "2026-11-08"],
      ["2026-11-12", "2026-11-15"],
    ],
  );
  assert.equal(schedule.handover, "2026-11-15");
  assert.equal(schedule.missingDays, 0);
});

test("alongside starts with the stage it follows; handover is the last finish, not the last stage's", () => {
  const schedule = forecast({
    stages: [stage("A"), stage("B"), stage("C")],
    sequence: [
      rule("A", null),
      rule("B", "A", { link: "alongside" }),
      rule("C", "A", { link: "alongside", waitDays: 1 }),
    ],
    days: { A: 3, B: 10, C: 2 },
  });
  assert.equal(byId(schedule, "B").start, "2026-11-02");
  assert.equal(byId(schedule, "C").start, "2026-11-03");
  assert.equal(schedule.handover, "2026-11-11");
});

test("a stage following one this villa does not have follows what that one followed", () => {
  const sequence = [rule("A", null), rule("X", "A", { waitDays: 7 }), rule("B", "X")];
  const schedule = forecast({ stages: [stage("A"), stage("B")], sequence, days: { A: 2, B: 2 } });
  // X is dropped: zero length, and its curing does not happen either.
  assert.equal(byId(schedule, "B").start, "2026-11-04");

  const alongside = forecast({
    stages: [stage("A"), stage("B")],
    sequence: [rule("A", null), rule("X", "A", { link: "alongside" }), rule("B", "X")],
    days: { A: 5, B: 2 },
  });
  assert.equal(byId(alongside, "B").start, "2026-11-02");
});

test("a stage the sequence does not name follows the stage before it", () => {
  const schedule = forecast({
    stages: [stage("A"), stage("Z")],
    sequence: [rule("A", null)],
    days: { A: 2, Z: 1 },
  });
  assert.equal(byId(schedule, "Z").start, "2026-11-04");
});

test("done keeps its real dates; working running long pushes everything after it", () => {
  const schedule = forecast({
    stages: [
      stage("A", { status: "done", startedOn: "2026-10-01", finishedOn: "2026-10-10" }),
      stage("B", { status: "working", startedOn: "2026-10-11" }),
      stage("C"),
    ],
    sequence: [rule("A", null), rule("B", "A"), rule("C", "B")],
    days: { B: 5, C: 3 },
    startOn: "2026-10-01",
  });
  assert.deepEqual(
    [byId(schedule, "A").start, byId(schedule, "A").finish],
    ["2026-10-01", "2026-10-10"],
  );
  // B should have finished 15 Oct; it is still going on 1 Nov, so it finishes today at the earliest.
  assert.equal(byId(schedule, "B").finish, TODAY);
  assert.equal(byId(schedule, "B").overdueDays, 17);
  assert.equal(byId(schedule, "C").start, "2026-11-02");
});

test("a not-started stage never starts in the past", () => {
  const schedule = forecast({
    stages: [stage("A"), stage("B")],
    sequence: [rule("A", null), rule("B", "A")],
    days: { A: 2, B: 2 },
    startOn: "2026-09-01",
  });
  assert.equal(byId(schedule, "A").start, TODAY);
  assert.equal(byId(schedule, "B").start, "2026-11-03");
});

test("a pinned start holds a stage back; once the chain overtakes it, the stage says behind", () => {
  const held = forecast({
    stages: [stage("A"), stage("B", { pinnedStart: "2026-11-20" })],
    sequence: [rule("A", null), rule("B", "A")],
    days: { A: 2, B: 2 },
  });
  assert.equal(byId(held, "B").start, "2026-11-20");
  assert.equal(byId(held, "B").pinnedBehind, false);

  const overtaken = forecast({
    stages: [stage("A"), stage("B", { pinnedStart: "2026-11-03" })],
    sequence: [rule("A", null), rule("B", "A")],
    days: { A: 10, B: 2 },
  });
  assert.equal(byId(overtaken, "B").start, "2026-11-12");
  assert.equal(byId(overtaken, "B").pinnedBehind, true);
});

test("no days: no dates past it, and the count says how many stages need days", () => {
  const schedule = forecast({
    stages: [stage("A"), stage("B"), stage("C")],
    sequence: [rule("A", null), rule("B", "A"), rule("C", "B")],
    days: { A: 2, C: 3 },
  });
  assert.equal(byId(schedule, "B").start, "2026-11-04");
  assert.equal(byId(schedule, "B").finish, null);
  assert.equal(byId(schedule, "C").start, null);
  assert.equal(schedule.handover, null);
  assert.equal(schedule.missingDays, 1);
  assert.match(firstPlanBlocker(schedule, "2026-11-02")!, /1 stage has no days/);
  assert.equal(firstPlanBlocker(schedule, null), "Set the villa's start date first.");
});

test("no start date: nothing has dates", () => {
  const schedule = forecast({
    stages: [stage("A"), stage("B")],
    sequence: [rule("A", null), rule("B", "A")],
    days: { A: 2, B: 2 },
    startOn: null,
  });
  assert.equal(byId(schedule, "A").start, null);
  assert.equal(schedule.handover, null);
});

test("a follows-loop gives no dates instead of hanging", () => {
  const schedule = forecast({
    stages: [stage("A"), stage("B")],
    sequence: [rule("A", "B"), rule("B", "A")],
    days: { A: 2, B: 2 },
  });
  assert.equal(schedule.handover, null);
});

test("slips against the first plan, per stage and at handover", () => {
  const schedule = forecast({
    stages: [
      stage("A", {
        baselineStart: "2026-10-20",
        baselineFinish: "2026-10-24",
        status: "working",
        startedOn: "2026-10-20",
      }),
      stage("B", { baselineStart: "2026-10-25", baselineFinish: "2026-10-30" }),
    ],
    sequence: [rule("A", null), rule("B", "A")],
    days: { A: 5, B: 6 },
    startOn: "2026-10-20",
    baselined: true,
  });
  // A's first plan finished 24 Oct; still working on 1 Nov.
  assert.equal(byId(schedule, "A").overdueDays, 8);
  assert.equal(byId(schedule, "A").slip, 8);
  assert.equal(byId(schedule, "B").start, "2026-11-02");
  assert.equal(schedule.handover, "2026-11-07");
  assert.equal(schedule.baselineHandover, "2026-10-30");
  assert.equal(schedule.slip, 8);
  assert.equal(describeSlip(8), "8 days behind the first plan");
  assert.equal(describeSlip(-1), "1 day ahead of the first plan");
  assert.equal(describeSlip(0), "on the first plan");
});

test("stage days: own, then learned, then typical scaled to the villa's size", () => {
  const learned = { days: 9, villas: 4 };
  assert.deepEqual(
    stageDays({ own: 4, learned, typicalDays: 6, villaSqft: 2000, typicalSqft: 1000 }),
    {
      days: 4,
      source: "own",
      learnedFrom: null,
    },
  );
  assert.deepEqual(
    stageDays({ own: null, learned, typicalDays: 6, villaSqft: 2000, typicalSqft: 1000 }),
    {
      days: 9,
      source: "learned",
      learnedFrom: 4,
    },
  );
  assert.equal(
    stageDays({ own: null, learned: null, typicalDays: 6, villaSqft: 2000, typicalSqft: 1000 })
      .days,
    12,
  );
  // Without both sizes the typical days are taken as they are.
  assert.equal(
    stageDays({ own: null, learned: null, typicalDays: 6, villaSqft: null, typicalSqft: 1000 })
      .days,
    6,
  );
  assert.deepEqual(
    stageDays({ own: null, learned: null, typicalDays: null, villaSqft: 2000, typicalSqft: 1000 }),
    {
      days: null,
      source: null,
      learnedFrom: null,
    },
  );
});

test("learned days need three finished villas: per sqft when sizes are known, plain days otherwise", () => {
  assert.equal(
    learnedDays(
      [
        { days: 10, sqft: 1000 },
        { days: 12, sqft: 1000 },
      ],
      1500,
    ),
    null,
  );
  assert.deepEqual(
    learnedDays(
      [
        { days: 10, sqft: 1000 },
        { days: 30, sqft: 2000 },
        { days: 8, sqft: 1000 },
      ],
      2000,
    ),
    // Per sqft: 0.010, 0.015, 0.008 → middle 0.010 → 20 days for 2,000 sqft.
    { days: 20, villas: 3 },
  );
  assert.deepEqual(
    learnedDays(
      [
        { days: 10, sqft: null },
        { days: 14, sqft: null },
        { days: 11, sqft: 1000 },
        { days: 40, sqft: null },
      ],
      2000,
    ),
    { days: 13, villas: 4 },
  );
});

test("a pinned start already past says so; the first plan's handover ignores a stage that joined later", () => {
  const passed = forecast({
    stages: [stage("A", { pinnedStart: "2026-10-20" })],
    sequence: [rule("A", null)],
    days: { A: 2 },
    startOn: "2026-10-15",
  });
  assert.equal(byId(passed, "A").start, TODAY);
  assert.equal(byId(passed, "A").pinnedBehind, true);

  const joined = forecast({
    stages: [stage("A", { baselineStart: "2026-11-02", baselineFinish: "2026-11-03" }), stage("Z")],
    sequence: [rule("A", null)],
    days: { A: 2, Z: 3 },
    baselined: true,
  });
  assert.equal(joined.baselineHandover, "2026-11-03");
  assert.equal(joined.slip, 3);
});

test("villaRules swaps in a villa's own follows and keeps the rest", () => {
  const rules = [
    { groupId: "A", followsGroupId: null, link: "after" as const, waitDays: 0, typicalDays: 3 },
    { groupId: "B", followsGroupId: "A", link: "after" as const, waitDays: 2, typicalDays: 4 },
    { groupId: "C", followsGroupId: "B", link: "after" as const, waitDays: 0, typicalDays: 5 },
  ];
  const own = villaRules(
    rules,
    new Map([["C", { followsGroupId: "A", link: "alongside" as const }]]),
  );
  assert.deepEqual(own[2], {
    groupId: "C",
    followsGroupId: "A",
    link: "alongside",
    waitDays: 0,
    typicalDays: 5,
  });
  assert.equal(own[1], rules[1]);
  assert.equal(followsInCircle(rules, "A", "C"), true);
  assert.equal(followsInCircle(rules, "C", "A"), false);
  assert.equal(followsInCircle(rules, "B", "B"), true);
});

test("villaRules gives a stage the sequence does not name its villa's own rule", () => {
  const rules = [
    { groupId: "A", followsGroupId: null, link: "after" as const, waitDays: 0, typicalDays: 3 },
  ];
  const own = villaRules(
    rules,
    new Map([["X", { followsGroupId: "A", link: "alongside" as const }]]),
  );
  assert.deepEqual(own[1], {
    groupId: "X",
    followsGroupId: "A",
    link: "alongside",
    waitDays: 0,
    typicalDays: null,
  });
});
