import assert from "node:assert/strict";
import { test } from "node:test";

import { contractorLoads, lookAhead, stagesAhead, type PlannedStage } from "./look-ahead";

const TODAY = "2026-11-02";

const stage = (code: string, extra: Partial<PlannedStage> = {}): PlannedStage => ({
  plotId: "p1",
  plotName: "7",
  villaName: "Villa 7",
  groupId: code,
  code,
  name: `Stage ${code}`,
  status: "not_started",
  startedOn: null,
  start: null,
  finish: null,
  days: null,
  contractorId: null,
  waitingOn: null,
  ...extra,
});

test("look ahead: this week is today to six days on; the next two weeks follow; begun or undated stages stay out", () => {
  const { thisWeek, nextTwoWeeks, waiting } = lookAhead(
    [
      stage("A", { start: "2026-11-08" }),
      stage("B", { start: "2026-11-02" }),
      stage("C", { start: "2026-11-09" }),
      stage("D", { start: "2026-11-22" }),
      stage("E", { start: "2026-11-23" }),
      stage("F", { status: "working", startedOn: "2026-11-01", start: "2026-11-01" }),
      stage("G"),
      stage("H", {
        status: "waiting",
        waitingOn: "material",
        startedOn: "2026-10-30",
        start: "2026-10-30",
      }),
    ],
    TODAY,
  );
  assert.deepEqual(
    thisWeek.map((entry) => entry.code),
    ["B", "A"],
  );
  assert.deepEqual(
    nextTwoWeeks.map((entry) => entry.code),
    ["C", "D"],
  );
  assert.deepEqual(
    waiting.map((entry) => entry.code),
    ["H"],
  );
});

test("contractor loads: two villas on the same days clash; back to back does not", () => {
  const loads = contractorLoads(
    [
      stage("A", { contractorId: "rafeeq", start: "2026-11-03", finish: "2026-11-08" }),
      stage("B", {
        plotId: "p2",
        plotName: "9",
        contractorId: "rafeeq",
        start: "2026-11-06",
        finish: "2026-11-10",
      }),
      stage("C", { contractorId: "anil", start: "2026-11-03", finish: "2026-11-05" }),
      stage("D", {
        plotId: "p2",
        plotName: "9",
        contractorId: "anil",
        start: "2026-11-06",
        finish: "2026-11-09",
      }),
      // Done, too far ahead, or long finished: none count.
      stage("E", {
        contractorId: "anil",
        status: "done",
        start: "2026-11-01",
        finish: "2026-11-02",
      }),
      stage("F", { contractorId: "anil", start: "2026-12-30", finish: "2027-01-02" }),
      stage("G", {
        contractorId: "anil",
        status: "working",
        startedOn: "2026-10-01",
        start: "2026-10-01",
        finish: "2026-10-10",
      }),
    ],
    TODAY,
  );
  assert.deepEqual(
    loads.map((load) => [load.contractorId, load.villas, load.clash, load.from]),
    [
      ["rafeeq", 2, true, "2026-11-03"],
      ["anil", 2, false, "2026-11-03"],
    ],
  );
});

test("a stage still running from before today counts from today", () => {
  const [load] = contractorLoads(
    [
      stage("A", {
        contractorId: "x",
        status: "working",
        startedOn: "2026-10-28",
        start: "2026-10-28",
        finish: "2026-11-04",
      }),
    ],
    TODAY,
  );
  assert.equal(load.from, TODAY);
});

test("a stage waiting before it began is in Waiting only", () => {
  const { thisWeek, waiting } = lookAhead(
    [stage("W", { status: "waiting", waitingOn: "material", start: "2026-11-02" })],
    TODAY,
  );
  assert.equal(thisWeek.length, 0);
  assert.equal(waiting.length, 1);
});

test("an untouched stage before the furthest begun one is left out, as on Next up", () => {
  const ahead = stagesAhead([
    stage("A", { status: "done", startedOn: "2026-10-01", start: "2026-10-01" }),
    stage("B", { start: TODAY }),
    stage("C", { status: "working", startedOn: "2026-10-20", start: "2026-10-20" }),
    stage("D", { start: "2026-11-05" }),
  ]);
  assert.deepEqual(
    ahead.map((entry) => entry.code),
    ["A", "C", "D"],
  );
});

test("a running stage with no days still clashes with the contractor's next villa", () => {
  const [load] = contractorLoads(
    [
      stage("A", {
        contractorId: "rafeeq",
        status: "working",
        startedOn: "2026-10-20",
        start: "2026-10-20",
      }),
      stage("B", {
        plotId: "p2",
        plotName: "9",
        contractorId: "rafeeq",
        start: "2026-11-03",
        finish: "2026-11-06",
      }),
    ],
    TODAY,
  );
  assert.equal(load.villas, 2);
  assert.equal(load.clash, true);
});
