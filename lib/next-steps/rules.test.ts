/** Pins the edges of the shared action rules. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  actionBucket,
  actionRemoval,
  addDays,
  closeRight,
  compareDone,
  compareOpen,
  daysBetween,
  dueChoices,
  dueLabel,
  greetingFor,
  loadOf,
  nextAction,
  setterOf,
  weekdayOf,
} from "./rules";

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
  assert.equal(at("waiting_management", "2026-01-01"), "management");
  assert.equal(at("awaiting_confirmation", "2026-01-01"), "confirm");
  // No date is overdue.
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
  assert.deepEqual(dueLabel({ status: "awaiting_confirmation", dueOn: "2026-09-01" }, TODAY), {
    text: "Finished · to confirm",
    tone: "success",
  });
});

test("the due menu's quick picks", () => {
  const picks = Object.fromEntries(dueChoices(TODAY).map((c) => [c.label, c.date]));
  assert.equal(picks["Today"], TODAY);
  assert.equal(picks["Tomorrow"], "2026-10-17");
  // Today is a Friday, so "this Friday" is next week's — today has its own line.
  assert.equal(picks["This Friday"], "2026-10-23");
  assert.equal(picks["Next Monday"], "2026-10-19");
  assert.equal(picks["In 2 weeks"], "2026-10-30");
  const monday = Object.fromEntries(dueChoices("2026-10-19").map((c) => [c.label, c.date]));
  assert.equal(monday["Next Monday"], "2026-10-26");
});

test("open actions sort by date, undated last, then by key; done newest first", () => {
  const list = [
    { id: "a", dueOn: null, sortKey: "P2" },
    { id: "b", dueOn: "2026-10-20", sortKey: "P10" },
    { id: "c", dueOn: "2026-10-20", sortKey: "P9" },
    { id: "d", dueOn: "2026-10-01", sortKey: "P1" },
  ];
  assert.deepEqual(
    [...list].sort(compareOpen).map((a) => a.id),
    ["d", "c", "b", "a"],
  );
  assert.deepEqual(
    [{ doneOn: "2026-10-01" }, { doneOn: "2026-10-09" }].sort(compareDone).map((a) => a.doneOn),
    ["2026-10-09", "2026-10-01"],
  );
});

test("the next action prefers real work over what waits to be confirmed", () => {
  const finished = { status: "awaiting_confirmation", dueOn: "2026-09-01" };
  assert.equal(
    nextAction([
      { status: "done", dueOn: "2026-01-01" },
      { status: "open", dueOn: null },
      { status: "open", dueOn: "2026-11-01" },
    ])?.dueOn,
    "2026-11-01",
  );
  assert.equal(nextAction([finished, { status: "open", dueOn: "2026-12-01" }])?.status, "open");
  assert.equal(nextAction([finished])?.status, "awaiting_confirmation");
  assert.equal(nextAction([{ status: "done", dueOn: null }]), null);
});

test("a person's load leaves out done and finished", () => {
  const load = loadOf(
    [
      { status: "open", dueOn: "2026-09-29", dueAssumed: true },
      { status: "open", dueOn: null },
      { status: "open", dueOn: "2026-10-18" },
      { status: "waiting_management", dueOn: "2026-10-18" },
      { status: "open", dueOn: "2026-12-01" },
      { status: "awaiting_confirmation", dueOn: "2026-09-01" },
      { status: "done", dueOn: "2026-10-01", doneOn: TODAY },
    ],
    TODAY,
  );
  assert.deepEqual(load, { open: 5, overdue: 2, week: 1, later: 1, management: 1, assumed: 1 });
});

test("the greeting follows the hour", () => {
  assert.equal(greetingFor(7), "Good morning");
  assert.equal(greetingFor(12), "Good afternoon");
  assert.equal(greetingFor(19), "Good evening");
});

test("only the setter, or a manager, closes an action", () => {
  const set = { createdBy: "navarang", ownerId: "jiljith" };
  assert.equal(closeRight(set, { id: "navarang", isManager: false }), "close");
  assert.equal(closeRight(set, { id: "siddharth", isManager: true }), "close");
  assert.equal(closeRight(set, { id: "jiljith", isManager: false }), "finish");
  assert.equal(closeRight(set, { id: "vaishnav", isManager: false }), "none");
  // Set by its own owner: they close it themselves.
  assert.equal(
    closeRight({ createdBy: "jiljith", ownerId: "jiljith" }, { id: "jiljith", isManager: false }),
    "close",
  );
  // No setter on record: the owner counts as one.
  const unset = { createdBy: null, ownerId: "jiljith" };
  assert.equal(setterOf(unset), "jiljith");
  assert.equal(closeRight(unset, { id: "jiljith", isManager: false }), "close");
});

test("an untouched action deletes, a changed one cancels, and only for whoever closes it", () => {
  const added = "2026-10-16T10:00:00.000Z";
  const fresh = {
    createdBy: "navarang",
    ownerId: "jiljith",
    status: "open",
    createdAt: added,
    updatedAt: "2026-10-16T10:01:00.000Z",
  };
  const setter = { id: "navarang", isManager: false };
  assert.equal(actionRemoval(fresh, setter), "delete");
  assert.equal(actionRemoval(fresh, { id: "siddharth", isManager: true }), "delete");
  // Its owner marks it finished; neither they nor a bystander remove it.
  assert.equal(actionRemoval(fresh, { id: "jiljith", isManager: false }), null);
  assert.equal(actionRemoval(fresh, { id: "vaishnav", isManager: false }), null);
  // Past the minute the cards call "Edited", or off open, it cancels.
  assert.equal(
    actionRemoval({ ...fresh, updatedAt: "2026-10-16T10:01:00.001Z" }, setter),
    "cancel",
  );
  assert.equal(actionRemoval({ ...fresh, status: "waiting_client" }, setter), "cancel");
  // Closed, cancelled included: nothing to remove.
  assert.equal(actionRemoval({ ...fresh, status: "done" }, setter), null);
});
