import assert from "node:assert/strict";
import { test } from "node:test";

import type { SheetRow } from "@/lib/masters/masters-workbook";
import {
  ACTIVITY_TARGET,
  coveredDays,
  plotProgress,
  plotsFromWorkbook,
  sequenceDays,
  sheetDate,
  type WorkbookPlot,
} from "./schedule-workbook";

// Excel day numbers: 46164 is 22 May 2026.
const D = (iso: string) =>
  String((Date.parse(`${iso}T00:00:00Z`) - Date.parse("1899-12-30T00:00:00Z")) / 86_400_000);

const sheet = (rows: (string | undefined)[][]): SheetRow[] =>
  rows.map((cells, index) => ({ row: index + 1, cells }));

test("sheetDate reads Excel day numbers and ISO dates, and nothing else", () => {
  assert.equal(sheetDate("46164"), "2026-05-22");
  assert.equal(sheetDate("2026-05-22T00:00:00"), "2026-05-22");
  assert.equal(sheetDate(""), null);
  assert.equal(sheetDate("2"), null);
  assert.equal(sheetDate("-"), null);
});

test("coveredDays counts each day once, both ends", () => {
  assert.equal(coveredDays([{ start: "2026-05-22", end: "2026-05-24" }]), 3);
  assert.equal(
    coveredDays([
      { start: "2026-05-22", end: "2026-05-24" },
      { start: "2026-05-24", end: "2026-05-25" },
    ]),
    4,
  );
  assert.equal(coveredDays([{ start: "2026-05-24", end: "2026-05-22" }]), 0);
});

test("plotsFromWorkbook reads each plot sheet, its supervisor and activities", () => {
  const sheets = new Map<string, SheetRow[]>([
    [
      "P-22-23",
      sheet([
        [
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          "Plot ID: 22",
          undefined,
          "Supervisor: Shibu",
        ],
        ["CODE", "Cr.Ph", "Description", "Sheduled starting date"],
        [
          "FDSD",
          "1",
          "Setting  out",
          D("2026-05-22"),
          D("2026-05-24"),
          "2",
          D("2026-05-22"),
          D("2026-05-25"),
          "3",
          "rain",
        ],
        [undefined, undefined, "Excavation", D("2026-05-25"), D("2026-05-28")],
      ]),
    ],
    ["Sheduled dates-Summary", sheet([["Code"]])],
  ]);
  const [plot] = plotsFromWorkbook(sheets);
  assert.equal(plot.plotCode, "P22-23");
  assert.equal(plot.supervisor, "Shibu");
  assert.equal(plot.activities.length, 2);
  assert.deepEqual(plot.activities[0], {
    key: "1|setting out",
    description: "Setting out",
    plannedStart: "2026-05-22",
    plannedEnd: "2026-05-24",
    actualStart: "2026-05-22",
    actualEnd: "2026-05-25",
    remark: "rain",
  });
  assert.equal(plot.activities[1].key, "|excavation");
});

const activity = (
  key: string,
  plannedStart: string,
  plannedEnd: string,
  actual?: [string, string],
) => ({
  key,
  description: key,
  plannedStart,
  plannedEnd,
  actualStart: actual?.[0] ?? null,
  actualEnd: actual?.[1] ?? null,
  remark: null,
});

test("sequenceDays rolls activities into stages, the middle across plots, curing apart", () => {
  const plot = (sheetName: string, footingEnd: string): WorkbookPlot => ({
    sheet: sheetName,
    plotCode: sheetName,
    supervisor: null,
    activities: [
      activity("|excavation", "2026-05-25", "2026-05-28"),
      activity("1|isolated footing with column pedistial", "2026-05-29", footingEnd),
      activity("4|curing for plinth beam", "2026-07-03", "2026-07-10"),
      activity("99|something new", "2026-07-03", "2026-07-10"),
    ],
  });
  const result = sequenceDays([
    plot("A", "2026-06-01"),
    plot("B", "2026-06-03"),
    plot("C", "2026-06-10"),
  ]);
  // 25 May – 1, 3 or 10 June: 8, 10 or 17 days; the middle is 10.
  assert.equal(result.typicalDays.get("FD.03"), 10);
  assert.equal(result.curingDays.get("FD.04"), 8);
  assert.deepEqual(result.unknown, ["99|something new"]);
});

test("plotProgress counts only what has happened by today", () => {
  const plot: WorkbookPlot = {
    sheet: "P-2",
    plotCode: "P2",
    supervisor: null,
    activities: [
      activity("1|setting out", "2026-05-22", "2026-05-24", ["2026-05-22", "2026-05-24"]),
      activity("|excavation", "2026-05-25", "2026-05-28", ["2026-05-25", "2026-05-28"]),
      activity("4|soil back filling", "2026-07-03", "2026-07-06", ["2026-10-20", "2026-10-30"]),
      activity("5|floor pcc", "2026-07-11", "2026-07-14", ["2026-11-01", "2026-11-04"]),
    ],
  };
  const progress = plotProgress(plot, "2026-10-23");
  assert.equal(progress.startOn, "2026-05-22");
  assert.deepEqual(progress.stages, [
    { code: "FD.01", status: "done", startedOn: "2026-05-22", finishedOn: "2026-05-24" },
    // Excavation done, back filling under way: the stage is working, from its first real start.
    { code: "FD.03", status: "working", startedOn: "2026-05-25", finishedOn: null },
  ]);
});

test("every mapped stage is a real stage code", () => {
  for (const target of Object.values(ACTIVITY_TARGET)) {
    if (!target) continue;
    const code = "stage" in target ? target.stage : target.curing;
    assert.match(code, /^(FD|SS|PF|F|MEP|CAR|LP)\.\d{2}$/);
  }
});
