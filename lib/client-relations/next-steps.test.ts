import assert from "node:assert/strict";
import { test } from "node:test";

import {
  actionBucket,
  addDays,
  closeRight,
  compareOpen,
  daysBetween,
  dueChoices,
  dueLabel,
  greetingFor,
  loadOf,
  nextAction,
  ownerOfSide,
  plotHealth,
  plotInList,
  plotNumber,
  plotRail,
  plotStatus,
  setterOf,
  weekdayOf,
  type PlotInput,
} from "./next-steps";

// Friday 16 October 2026.
const TODAY = "2026-10-16";

test("calendar arithmetic stays on the calendar", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(daysBetween("2026-10-16", "2026-10-13"), -3);
  assert.equal(daysBetween("2026-10-16", "2026-10-16"), 0);
  assert.equal(weekdayOf(TODAY), 5);
});

test("an action's section", () => {
  const at = (status: string, dueOn: string | null) => actionBucket({ status, dueOn }, TODAY);
  assert.equal(at("done", "2026-01-01"), "done");
  // Waiting on management outranks being overdue.
  assert.equal(at("waiting_management", "2026-01-01"), "management");
  assert.equal(at("open", null), "overdue");
  assert.equal(at("waiting_client", "2026-10-15"), "overdue");
  assert.equal(at("open", TODAY), "week");
  assert.equal(at("open", "2026-10-23"), "week");
  assert.equal(at("open", "2026-10-24"), "later");
});

test("what a date chip says", () => {
  const say = (dueOn: string | null, extra: object = {}) =>
    dueLabel({ status: "open", dueOn, ...extra }, TODAY);
  assert.deepEqual(say(null), { text: "No date · overdue", tone: "danger" });
  assert.deepEqual(say("2026-10-15"), { text: "1 day overdue", tone: "danger" });
  assert.deepEqual(say("2026-09-29", { dueAssumed: true }), {
    text: "17 days overdue · date assumed",
    tone: "danger",
  });
  assert.deepEqual(say(TODAY), { text: "Today", tone: "info" });
  assert.deepEqual(say("2026-10-17"), { text: "Tomorrow", tone: "info" });
  assert.equal(say("2026-10-20").tone, "info");
  assert.match(say("2026-10-20").text, /Tue/);
  assert.equal(say("2026-11-30").tone, "neutral");
  assert.equal(dueLabel({ status: "done", dueOn: null, doneOn: null }, TODAY).text, "Done");
  assert.equal(dueLabel({ status: "done", dueOn: null, doneOn: TODAY }, TODAY).tone, "success");
});

test("the due menu's quick picks", () => {
  const picks = Object.fromEntries(dueChoices(TODAY).map((c) => [c.label, c.date]));
  assert.equal(picks["Today"], TODAY);
  assert.equal(picks["Tomorrow"], "2026-10-17");
  // Today is a Friday, so "this Friday" is next week's — today has its own line.
  assert.equal(picks["This Friday"], "2026-10-23");
  assert.equal(picks["Next Monday"], "2026-10-19");
  assert.equal(picks["In 2 weeks"], "2026-10-30");
  const saturday = Object.fromEntries(dueChoices("2026-10-17").map((c) => [c.label, c.date]));
  assert.equal(saturday["This Friday"], "2026-10-23");
  const monday = Object.fromEntries(dueChoices("2026-10-19").map((c) => [c.label, c.date]));
  assert.equal(monday["Next Monday"], "2026-10-26");
});

test("open actions sort by date, undated last, then by plot number", () => {
  const list = [
    { id: "a", dueOn: null, plotSort: "P2" },
    { id: "b", dueOn: "2026-10-20", plotSort: "P10" },
    { id: "c", dueOn: "2026-10-20", plotSort: "P9" },
    { id: "d", dueOn: "2026-10-01", plotSort: "P1" },
  ];
  assert.deepEqual(
    [...list].sort(compareOpen).map((a) => a.id),
    ["d", "c", "b", "a"],
  );
  assert.equal(
    nextAction([
      { status: "done", dueOn: "2026-01-01" },
      { status: "open", dueOn: null },
      { status: "open", dueOn: "2026-11-01" },
    ])?.dueOn,
    "2026-11-01",
  );
  assert.equal(nextAction([{ status: "done", dueOn: null }]), null);
});

test("a person's load", () => {
  const load = loadOf(
    [
      { status: "open", dueOn: "2026-09-29", dueAssumed: true },
      { status: "open", dueOn: null },
      { status: "open", dueOn: "2026-10-18" },
      { status: "waiting_management", dueOn: "2026-10-18" },
      { status: "open", dueOn: "2026-12-01" },
      { status: "done", dueOn: "2026-10-01", doneOn: TODAY },
    ],
    TODAY,
  );
  assert.deepEqual(load, { open: 5, overdue: 2, week: 1, later: 1, management: 1, assumed: 1 });
});

test("the greeting follows the hour in India", () => {
  assert.equal(greetingFor(7), "Good morning");
  assert.equal(greetingFor(12), "Good afternoon");
  assert.equal(greetingFor(19), "Good evening");
});

const sold = (over: Partial<PlotInput> = {}): PlotInput => ({
  hasBuyer: true,
  unitStatus: "sold",
  saleDeedStatus: "signed",
  caStatus: "not_signed",
  stageIndex: -1,
  finalIndex: 8,
  ...over,
});

test("a plot's status climbs the tracker's ladder", () => {
  assert.equal(plotStatus(sold({ hasBuyer: false, unitStatus: "available" })), "available");
  assert.equal(plotStatus(sold({ hasBuyer: false, unitStatus: "reserved" })), "reserved");
  assert.equal(plotStatus(sold({ saleDeedStatus: "drafting" })), "booked");
  assert.equal(plotStatus(sold()), "deed_signed");
  assert.equal(plotStatus(sold({ caStatus: "signed" })), "ca_signed");
  assert.equal(plotStatus(sold({ caStatus: "signed", stageIndex: 8 })), "handed_over");
});

test("a plot's health", () => {
  const health = (
    plot: PlotInput,
    actions: { status: string; dueOn: string | null }[],
    touched = TODAY,
  ) => plotHealth({ ...plot, lastTouched: touched }, actions, TODAY);
  assert.equal(health(sold({ hasBuyer: false }), []), null);
  assert.equal(health(sold(), [{ status: "open", dueOn: "2026-10-01" }]), "overdue");
  assert.equal(health(sold(), [{ status: "open", dueOn: null }]), "overdue");
  // Overdue first, even beside a management flag — and a flagged action is never "overdue".
  assert.equal(
    health(sold(), [
      { status: "waiting_management", dueOn: "2026-10-01" },
      { status: "open", dueOn: "2026-11-01" },
    ]),
    "management",
  );
  assert.equal(health(sold(), []), "no_next_step");
  assert.equal(health(sold({ stageIndex: 8 }), []), "handed_over");
  assert.equal(health(sold(), [{ status: "open", dueOn: "2026-11-01" }], "2026-10-01"), "stale");
  assert.equal(health(sold(), [{ status: "open", dueOn: "2026-11-01" }], "2026-10-02"), "on_track");
  assert.equal(health(sold(), [{ status: "done", dueOn: null }]), "no_next_step");
});

test("a plot's rail", () => {
  assert.deepEqual(plotRail(sold({ hasBuyer: false, saleDeedStatus: "not_signed" })), {
    steps: [false, false, false, false, false],
    build: 0,
  });
  assert.deepEqual(plotRail(sold({ stageIndex: 0 })).steps, [true, true, false, false, false]);
  const slab = plotRail(sold({ caStatus: "signed", stageIndex: 3 }));
  assert.deepEqual(slab.steps, [true, true, true, true, false]);
  assert.equal(slab.build, 3 / 8);
  const done = plotRail(sold({ caStatus: "signed", stageIndex: 8 }));
  assert.deepEqual(done.steps, [true, true, true, true, true]);
  assert.equal(done.build, 1);
  assert.equal(plotRail(sold({ stageIndex: -1, finalIndex: -1 })).steps[4], false);
});

test("a plot's number, as the tracker printed it", () => {
  assert.equal(plotNumber("P10", "Plot 10"), "10");
  assert.equal(plotNumber("P22-23", "Plot 22 & 23"), "22-23");
  assert.equal(plotNumber("SW-03", "Plot 3"), "SW-03");
  assert.equal(plotNumber(null, "Villa 7"), "7");
  assert.equal(plotNumber("  ", "Plot 9"), "9");
  assert.equal(plotNumber(null, "Plot"), "Plot");
});

test("only the setter, or a manager, closes an action", () => {
  const set = { createdBy: "saurav", ownerId: "anu" };
  assert.equal(closeRight(set, { id: "saurav", isManager: false }), "close");
  assert.equal(closeRight(set, { id: "siddharth", isManager: true }), "close");
  assert.equal(closeRight(set, { id: "anu", isManager: false }), "finish");
  assert.equal(closeRight(set, { id: "sayooj", isManager: false }), "none");
  assert.equal(
    closeRight({ createdBy: "anu", ownerId: "anu" }, { id: "anu", isManager: false }),
    "close",
  );
  // Brought in from the tracker with no setter: the owner counts as one.
  const imported = { createdBy: null, ownerId: "anu" };
  assert.equal(setterOf(imported), "anu");
  assert.equal(closeRight(imported, { id: "anu", isManager: false }), "close");
  assert.equal(closeRight(imported, { id: "sayooj", isManager: false }), "none");
});

test("finished and waiting to confirm is never overdue, nor anyone's load", () => {
  const finished = { status: "awaiting_confirmation", dueOn: "2026-09-01" };
  assert.equal(actionBucket(finished, TODAY), "confirm");
  assert.deepEqual(dueLabel(finished, TODAY), { text: "Finished · to confirm", tone: "success" });
  assert.equal(loadOf([finished, { status: "open", dueOn: null }], TODAY).open, 1);
  assert.equal(plotHealth({ ...sold(), lastTouched: TODAY }, [finished], TODAY), "on_track");
  assert.equal(nextAction([finished, { status: "open", dueOn: "2026-12-01" }])?.status, "open");
  assert.equal(nextAction([finished])?.status, "awaiting_confirmation");
});

test("the Plots grid by side: Interior lists only plots with interior work", () => {
  const sold = { constructionOwner: "anu", interiorOwner: null, interiorStage: null };
  const pitched = {
    constructionOwner: "anu",
    interiorOwner: "sayooj",
    interiorStage: "pitch_done",
  };
  const construction = [{ track: "sales", ownerId: "anu", status: "open" }];
  const interior = [{ track: "kaadal", ownerId: "sebastina", status: "open" }];

  assert.equal(plotInList(sold, construction, null, null), true);
  assert.equal(plotInList(sold, construction, "sales", null), true);
  assert.equal(plotInList(sold, construction, "kaadal", null), false, "no interior work at all");
  assert.equal(
    plotInList(sold, interior, "kaadal", null),
    true,
    "an open interior action is interior work",
  );
  assert.equal(plotInList({ ...sold, interiorStage: "to_pitch" }, [], "kaadal", null), true);
  assert.equal(plotInList(pitched, [], "kaadal", null), true);
});

test("the Plots grid by side and person: each side has its own owner", () => {
  const plot = { constructionOwner: "anu", interiorOwner: "sayooj", interiorStage: "pitch_done" };
  const open = [
    { track: "sales", ownerId: "sebastina", status: "open" },
    { track: "kaadal", ownerId: "anu", status: "waiting_management" },
  ];

  assert.equal(plotInList(plot, open, null, "anu"), true);
  assert.equal(plotInList(plot, open, null, "sayooj"), true);
  assert.equal(plotInList(plot, open, "sales", "anu"), true);
  assert.equal(
    plotInList(plot, open, "sales", "sayooj"),
    false,
    "the interior owner is not construction's",
  );
  assert.equal(plotInList(plot, open, "sales", "sebastina"), true);
  assert.equal(plotInList(plot, open, "kaadal", "sayooj"), true);
  assert.equal(plotInList(plot, open, "kaadal", "anu"), true, "anu holds an interior action");
  assert.equal(plotInList(plot, open, "kaadal", "sebastina"), false);
  assert.equal(plotInList(plot, open, "kaadal", "mgmt"), true);
  assert.equal(plotInList(plot, open, "sales", "mgmt"), false);
  assert.equal(plotInList(plot, open, null, "all"), true);
});

test("a step on a plot belongs to its side's owner, or to nobody yet", () => {
  const plot = { constructionOwnerId: "anu", interiorOwnerId: "sayooj" };
  assert.equal(ownerOfSide(plot, "sales"), "anu");
  assert.equal(ownerOfSide(plot, "kaadal"), "sayooj");
  assert.equal(ownerOfSide({ ...plot, interiorOwnerId: null }, "kaadal"), null);
});
