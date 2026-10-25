import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal, entryFor, recordsOf } from "../catalogue-fields";
import { BOUNCE_REASONS, departmentIdsFrom, typeListAfter } from "./relay";

const TRAIL = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const UNIT = "33333333-3333-4333-8333-333333333333";
const ACTIVITY = "44444444-4444-4444-8444-444444444444";
const PERSON = "55555555-5555-4555-8555-555555555555";
const TYPE = "66666666-6666-4666-8666-666666666666";

const ok = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", ...row }] }).ok;

test("the bounce reasons are Relay's own, value and label", () => {
  const source = readFileSync("lib/relay/events.ts", "utf8");
  const theirs = [...source.matchAll(/\{ value: "(\w+)", label: "([^"]+)" \}/g)].map((m) => [
    m[1],
    m[2],
  ]);
  assert.deepEqual(theirs, Object.entries(BOUNCE_REASONS));
});

test("Relay's three list forms read only the name Turing sends", () => {
  const source = readFileSync("lib/relay/actions.ts", "utf8");
  for (const reader of ["createActivity", "createDepartment", "createTrailSet"]) {
    const at = source.search(new RegExp(`function ${reader}\\(`));
    assert.ok(at >= 0, reader);
    const body = source.slice(at, source.indexOf("\n}\n", at));
    assert.deepEqual(
      [...body.matchAll(/formData, "(\w+)"/g)].map((m) => m[1]),
      ["name"],
      reader,
    );
  }
});

test("a bounce goes back with a leg, a reason and a note; nothing else takes them", () => {
  const move = { chain_id: TRAIL, leg: 3 };
  assert.equal(ok("relay_move", { ...move, move: "push" }), true);
  assert.equal(ok("relay_move", { ...move, move: "push", note: "Drawings attached" }), true);
  assert.equal(ok("relay_move", { ...move, move: "bounce" }), false);
  assert.equal(
    ok("relay_move", { ...move, move: "bounce", to_leg: 1, reason: "rework", note: "Fix levels" }),
    true,
  );
  assert.equal(
    ok("relay_move", { ...move, move: "bounce", to_leg: 3, reason: "rework", note: "x" }),
    false,
  );
  assert.equal(
    ok("relay_move", { ...move, move: "bounce", to_leg: 1, reason: "rework", note: "" }),
    false,
  );
  assert.equal(ok("relay_move", { ...move, move: "push", reason: "rework" }), false);
  assert.equal(ok("relay_move", { ...move, move: "finish", to_leg: 1 }), false);
  assert.equal(ok("relay_move", { chain_id: TRAIL, leg: 0, move: "push" }), false);
  assert.equal(ok("relay_move", { ...move, move: "bounce_back" }), false);
});

test("a handover needs who and why", () => {
  assert.equal(ok("relay_hand", { chain_id: TRAIL, person_id: PERSON, note: "On leave" }), true);
  assert.equal(ok("relay_hand", { chain_id: TRAIL, person_id: PERSON }), false);
});

test("a trail's stage and departments are given (empty clears them), never left out", () => {
  assert.equal(ok("relay_trail_stage", { chain_id: TRAIL }), false);
  assert.equal(ok("relay_trail_stage", { chain_id: TRAIL, stage_id: "" }), true);
  assert.equal(ok("relay_trail_departments", { chain_id: TRAIL }), false);
  assert.equal(ok("relay_trail_departments", { chain_id: TRAIL, departments: "" }), true);
});

test("switching a list's entry on or off names exactly one", () => {
  assert.equal(ok("relay_list_active", { active: false }), false);
  assert.equal(ok("relay_list_active", { activity_id: ACTIVITY, active: false }), true);
  assert.equal(
    ok("relay_list_active", { activity_id: ACTIVITY, type_id: TYPE, active: false }),
    false,
  );
});

test("a schedule stage's change says what changes", () => {
  assert.equal(ok("relay_project_stage_change", { stage_id: TRAIL }), false);
  assert.equal(ok("relay_project_stage_change", { stage_id: TRAIL, weeks: 6 }), true);
  assert.equal(ok("relay_project_stage_change", { stage_id: TRAIL, name: "" }), false);
});

test("a new trail starts unless queued, and its legs group by its header", () => {
  const entry = entryFor("relay_trail_new");
  assert.ok(entry);
  const leg = { activity_id: ACTIVITY, person_id: PERSON, days: 2 };
  const proposal = checkProposal({
    action: "relay_trail_new",
    title: "x",
    rows: [
      { label: "a", project_id: PROJECT, unit_id: UNIT, title: "R1 set", ...leg },
      { label: "b", project_id: PROJECT, unit_id: UNIT, title: "R1 set", ...leg, days: 4 },
      { label: "c", project_id: PROJECT, start_now: false, ...leg },
    ],
  });
  assert.ok(proposal.ok);
  assert.equal(proposal.value.rows[0].values.start_now, true);
  const records = recordsOf(
    entry,
    proposal.value.rows,
    proposal.value.rows.map((row, index) => ({ index, row })),
  );
  assert.ok(records.ok);
  assert.deepEqual(
    records.value.map((record) => record.rows.length),
    [2, 1],
  );
  assert.equal(records.value[1].header.start_now, false);
});

test("department names match Relay's, ignoring case; an unknown one is refused", () => {
  const allowed = [
    { id: "d1", name: "Design" },
    { id: "d2", name: "Purchase" },
  ];
  assert.deepEqual(departmentIdsFrom("design, PURCHASE", allowed), { ids: ["d1", "d2"] });
  assert.deepEqual(departmentIdsFrom("Design, design", allowed), { ids: ["d1"] });
  assert.deepEqual(departmentIdsFrom("", allowed), { ids: [] });
  assert.ok("error" in departmentIdsFrom("Design, Site", allowed));
});

test("a trail type's activity is added, moved, re-timed or taken out, as its editor does", () => {
  const list = [
    { activityId: "a", expectedDays: 3 },
    { activityId: "b", expectedDays: 5 },
  ];
  assert.deepEqual(typeListAfter(list, { activityId: "c" }), {
    items: [...list, { activityId: "c", expectedDays: 2 }],
  });
  assert.deepEqual(typeListAfter(list, { activityId: "c", position: 1, days: 4 }), {
    items: [{ activityId: "c", expectedDays: 4 }, ...list],
  });
  assert.deepEqual(typeListAfter(list, { activityId: "b", position: 1 }), {
    items: [list[1], list[0]],
  });
  assert.deepEqual(typeListAfter(list, { activityId: "a", days: 7 }), {
    items: [{ activityId: "a", expectedDays: 7 }, list[1]],
  });
  assert.deepEqual(typeListAfter(list, { activityId: "a", remove: true }), { items: [list[1]] });
  assert.ok("error" in typeListAfter(list, { activityId: "c", remove: true }));
  assert.ok("error" in typeListAfter(list, { activityId: "a", days: 3 }));
  assert.ok("error" in typeListAfter(list, { activityId: "a", position: 1 }));
  assert.ok("error" in typeListAfter(list, { activityId: "a", position: 3 }));
  assert.ok("error" in typeListAfter(list, { activityId: "c", position: 4 }));
});
