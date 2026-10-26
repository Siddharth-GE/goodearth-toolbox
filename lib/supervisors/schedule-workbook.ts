import type { SheetRow } from "@/lib/masters/masters-workbook";
import { addDays } from "./schedule";

// Pure. The site team's schedule workbook (one sheet a plot, ~70 activities): each activity mapped to a stage, the stage's
// typical days rolled up from the planned dates, and each plot's real progress from the actual dates.

/** An activity's stage, or the stage whose curing it is (wait days before what follows it). Null: left out, and said so. */
type Target = { stage: string } | { curing: string } | null;

/** Keyed "crit-path number|description", lower case, as every plot sheet spells it. */
export const ACTIVITY_TARGET: Record<string, Target> = {
  "1|setting out": { stage: "FD.01" },
  "|excavation": { stage: "FD.03" },
  "|manual pit cleaning": { stage: "FD.03" },
  "|pcc": { stage: "FD.03" },
  "|random rubble": { stage: "FD.02" },
  "|latrite basement": { stage: "FD.02" },
  "1|isolated footing with column pedistial": { stage: "FD.03" },
  "|pile foundation": { stage: "FD.04" },
  "|curing for pile foundation": { curing: "FD.04" },
  "2|plinth beam": { stage: "FD.04" },
  "3|dpc": { stage: "FD.04" },
  "4|soil back filling": { stage: "FD.03" },
  "4|curing for plinth beam": { curing: "FD.04" },
  "5|floor pcc": { stage: "SS.03" },
  "6|block work upto sill level(gf)": { stage: "SS.01" },
  "7|sill beam and landing beam concrete": { stage: "SS.01" },
  "8|block work upto lintel level": { stage: "SS.01" },
  "9|lintel concrete(gf)": { stage: "SS.02" },
  "10|curing for lintel concrete(gf)": { curing: "SS.02" },
  "11|lite roof -beam": { stage: "SS.04" },
  "12|block work upto gf flat slab(gf)": { stage: "SS.04" },
  "13|gf flat slab and beam concrete": { stage: "SS.05" },
  "14|curing for gf flat slab": { curing: "SS.05" },
  // Ground-floor chasing while the first floor goes up: off the critical path, so it does not lengthen Wall Chasing.
  "14|electrical wall chasing ff": null,
  "14|electrical wall chasing gf": null,
  "15|block work upto sill level(ff)": { stage: "SS.06" },
  "16|sill beam and landing beam concrete": { stage: "SS.06" },
  "17|block work upto lintel level(ff)": { stage: "SS.06" },
  "18|lintel concrete": { stage: "SS.07" },
  "19|curing for lintel concrete(ff)": { curing: "SS.07" },
  "20|block work upto ff flat slab(ff)": { stage: "SS.08" },
  "21|lite roof -beam": { stage: "SS.08" },
  "22|ff flat slab and beam concrete": { stage: "SS.08" },
  "23|curing for gf flat slab": { curing: "SS.08" },
  "23|block work upto bedconcrete(ff)": { stage: "SS.10" },
  "24|ff bed concrete": { stage: "SS.09" },
  "25|bull marking": { stage: "PF.01" },
  "26|electrical wall chasing ff": { stage: "MEP.04" },
  "26|joinery frame fixing": { stage: "PF.01" },
  "27|roof & handrail fabrictions": { stage: "PF.03" },
  "28|plastering and screed": { stage: "PF.01" },
  "29|water proofing works & core cutting": { stage: "PF.03" },
  "30|bathroom electrical,plumping": { stage: "MEP.05" },
  "31|cinder filling and pcc (m15)": { stage: "PF.03" },
  "32|ledge wall masnory and water proofing": { stage: "PF.03" },
  "33|plumping work": { stage: "MEP.05" },
  "34|electrical wiring work": { stage: "MEP.07" },
  "35|putty works": { stage: "F.03" },
  "36|polishing work -first coat": { stage: "F.01" },
  "37|floor tiling and granite works": { stage: "F.02" },
  "38|fabricated/wooden stair case": { stage: "CAR.02" },
  "39|painting-first coat": { stage: "F.03" },
  "40|switch board fixing": { stage: "MEP.09" },
  "40|joinery shutter fixing": { stage: "CAR.01" },
  "41|wooden -skerting & bay window seater": { stage: "CAR.02" },
  "42|polishing work -second coat": { stage: "F.01" },
  "43|painting-second coat": { stage: "F.03" },
  "44|cleaning and pointing floor tile": { stage: "F.02" },
  "45|cp and ele fixtures work": { stage: "MEP.08" },
  "46|snag": { stage: "MEP.11" },
  "25|external cladding works": { stage: "F.04" },
  "26|cheja works": { stage: "F.04" },
  "27|duct - jali & fabricated door works": { stage: "F.04" },
  "28|coving for roof fabrication": { stage: "F.04" },
  "29|appliying zycosil to expose wall": { stage: "F.04" },
  "30|appliying clear coat to expose wall": { stage: "F.04" },
  "25|mep": { stage: "MEP.10" },
  "25|land scape and parking": { stage: "LP.03" },
};

export type WorkbookActivity = {
  key: string;
  description: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  remark: string | null;
};

export type WorkbookPlot = {
  sheet: string;
  /** As the plots table writes it: "P2", "P22-23". */
  plotCode: string;
  supervisor: string | null;
  activities: WorkbookActivity[];
};

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

/** Excel's day number, or an ISO date already. */
export function sheetDate(value: string | undefined): string | null {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const serial = Number(text);
  if (!text || !Number.isFinite(serial) || serial < 30_000 || serial > 80_000) return null;
  return addDays("1899-12-30", Math.floor(serial));
}

export const activityKey = (critPath: string | undefined, description: string | undefined) =>
  `${clean(critPath)}|${clean(description).toLowerCase()}`;

/** Every plot sheet ("P-2", "P-22-23"): the row under the header onward, until the rows run out. */
export function plotsFromWorkbook(sheets: Map<string, SheetRow[]>): WorkbookPlot[] {
  const plots: WorkbookPlot[] = [];
  for (const [sheet, rows] of sheets) {
    const match = /^P-(\d+(?:-\d+)?)$/.exec(sheet.trim());
    if (!match) continue;
    const supervisorCell = rows
      .flatMap((row) => row.cells)
      .find((cell) => /^supervisor:/i.test(clean(cell)));
    const activities: WorkbookActivity[] = [];
    for (const row of rows) {
      const description = clean(row.cells[2]);
      if (!description || /^description$/i.test(description)) continue;
      activities.push({
        key: activityKey(row.cells[1], row.cells[2]),
        description,
        plannedStart: sheetDate(row.cells[3]),
        plannedEnd: sheetDate(row.cells[4]),
        actualStart: sheetDate(row.cells[6]),
        actualEnd: sheetDate(row.cells[7]),
        remark: clean(row.cells[9]) || null,
      });
    }
    plots.push({
      sheet,
      plotCode: `P${match[1]}`,
      supervisor: supervisorCell
        ? clean(supervisorCell).replace(/^supervisor:\s*/i, "") || null
        : null,
      activities,
    });
  }
  return plots;
}

/** The calendar days a set of date ranges covers, each day once, both ends counted. */
export function coveredDays(ranges: { start: string; end: string }[]): number {
  const days = new Set<string>();
  for (const { start, end } of ranges) {
    if (end < start) continue;
    for (let day = start; day <= end; day = addDays(day, 1)) days.add(day);
  }
  return days.size;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export type SequenceDays = {
  /** Stage code → typical days: the middle, across plots, of the days its planned activities cover. */
  typicalDays: Map<string, number>;
  /** Cured stage code → wait days after it: the middle of its curing's planned days. */
  curingDays: Map<string, number>;
  /** Activity keys no mapping names: a new spelling in the workbook. */
  unknown: string[];
};

export function sequenceDays(plots: WorkbookPlot[]): SequenceDays {
  const stageSamples = new Map<string, number[]>();
  const curingSamples = new Map<string, number[]>();
  const unknown = new Set<string>();
  for (const plot of plots) {
    const ranges = new Map<string, { start: string; end: string }[]>();
    const curing = new Map<string, { start: string; end: string }[]>();
    for (const activity of plot.activities) {
      if (!(activity.key in ACTIVITY_TARGET)) {
        unknown.add(activity.key);
        continue;
      }
      const target = ACTIVITY_TARGET[activity.key];
      if (!target || !activity.plannedStart || !activity.plannedEnd) continue;
      const range = { start: activity.plannedStart, end: activity.plannedEnd };
      const [into, code] = "stage" in target ? [ranges, target.stage] : [curing, target.curing];
      into.set(code, [...(into.get(code) ?? []), range]);
    }
    for (const [code, list] of ranges)
      stageSamples.set(code, [...(stageSamples.get(code) ?? []), coveredDays(list)]);
    for (const [code, list] of curing)
      curingSamples.set(code, [...(curingSamples.get(code) ?? []), coveredDays(list)]);
  }
  const middle = (samples: Map<string, number[]>) =>
    new Map([...samples].map(([code, values]) => [code, median(values)]));
  return {
    typicalDays: middle(stageSamples),
    curingDays: middle(curingSamples),
    unknown: [...unknown].sort(),
  };
}

export type PlotStage = {
  code: string;
  status: "working" | "done";
  startedOn: string;
  finishedOn: string | null;
};

export type PlotProgress = {
  /** The first planned start: the villa's start date. */
  startOn: string | null;
  stages: PlotStage[];
};

/**
 * A plot's real progress. The workbook's actual dates run on into the future as a forecast, so only what has happened counts: a
 * stage is working once one of its activities has an actual start on or before today, and done only when every activity it has
 * (one with any date at all) has an actual end before today — a blank end is not finished.
 */
export function plotProgress(plot: WorkbookPlot, today: string): PlotProgress {
  const planned = plot.activities
    .map((activity) => activity.plannedStart)
    .filter((date): date is string => date !== null);
  const byStage = new Map<string, WorkbookActivity[]>();
  for (const activity of plot.activities) {
    const target = ACTIVITY_TARGET[activity.key];
    if (!target || !("stage" in target)) continue;
    byStage.set(target.stage, [...(byStage.get(target.stage) ?? []), activity]);
  }
  const stages: PlotStage[] = [];
  for (const [code, activities] of byStage) {
    // Rows with no date at all (Random rubble on a footing villa) are works this plot does not have.
    const real = activities.filter(
      (activity) =>
        activity.plannedStart || activity.plannedEnd || activity.actualStart || activity.actualEnd,
    );
    const started = real.flatMap((activity) =>
      activity.actualStart && activity.actualStart <= today ? [activity.actualStart] : [],
    );
    if (started.length === 0) continue;
    const done = real.every(
      (activity) => activity.actualEnd !== null && activity.actualEnd < today,
    );
    stages.push({
      code,
      status: done ? "done" : "working",
      startedOn: started.reduce((a, b) => (a < b ? a : b)),
      finishedOn: done
        ? real.map((activity) => activity.actualEnd!).reduce((a, b) => (a > b ? a : b))
        : null,
    });
  }
  return {
    startOn: planned.length ? planned.reduce((a, b) => (a < b ? a : b)) : null,
    stages,
  };
}
