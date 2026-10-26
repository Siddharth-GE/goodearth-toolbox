import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal, entryFor, recordsOf } from "../catalogue-fields";
import { movedStage, passTargetIds } from "./design-management";

const VILLA = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const STAGE = "33333333-3333-4333-8333-333333333333";
const LATER = "44444444-4444-4444-8444-444444444444";
const PERSON = "55555555-5555-4555-8555-555555555555";
const SECOND = "66666666-6666-4666-8666-666666666666";

test("a stage moves to the start, or after another, the rest keeping their order", () => {
  assert.deepEqual(movedStage(["a", "b", "c", "d"], "c", null), ["c", "a", "b", "d"]);
  assert.deepEqual(movedStage(["a", "b", "c", "d"], "a", "c"), ["b", "c", "a", "d"]);
  assert.deepEqual(movedStage(["a", "b", "c", "d"], "d", "a"), ["a", "d", "b", "c"]);
  assert.deepEqual(movedStage(["a", "b", "c"], "b", "a"), ["a", "b", "c"]);
});

test("only the stage a villa sits at passes on, and only to a later board stage", () => {
  const board = ["design", "permit", "wd", "structural"];
  // Sits at Permit (the furthest started), with Design revising behind it.
  const started = new Set(["design", "permit"]);
  assert.deepEqual(passTargetIds(board, started, "permit"), ["wd", "structural"]);
  assert.deepEqual(passTargetIds(board, started, "design"), []);
  assert.deepEqual(passTargetIds(board, started, "wd"), []);
  assert.deepEqual(passTargetIds(board, new Set(["structural"]), "structural"), []);
  assert.deepEqual(passTargetIds(board, started, "off-the-board"), []);
});

test("sending a stage back needs its reason, and a reason goes with nothing else", () => {
  const row = (values: object) =>
    checkProposal({
      action: "design_step_status",
      title: "x",
      rows: [{ label: "a", unit_id: VILLA, stage_id: STAGE, ...values }],
    });
  assert.ok(!row({ status: "revising" }).ok);
  assert.ok(row({ status: "revising", reason: "Client changed the staircase" }).ok);
  assert.ok(!row({ status: "done", reason: "Finished" }).ok);
  assert.ok(row({ status: "not_started" }).ok);
});

test("a step's note is given (empty clears it), never left out", () => {
  const note = (values: object) =>
    checkProposal({
      action: "design_step_note",
      title: "x",
      rows: [{ label: "a", unit_id: VILLA, stage_id: STAGE, ...values }],
    }).ok;
  assert.equal(note({}), false);
  assert.equal(note({ note: "" }), true);
  assert.equal(note({ note: "Waiting for the slab levels" }), true);
});

test("an admin closes a design action directly: finished-awaiting-confirmation is not offered", () => {
  const status = (value: string) =>
    checkProposal({
      action: "design_action_change",
      title: "x",
      rows: [{ label: "a", action_id: OTHER, status: value }],
    }).ok;
  assert.equal(status("done"), true);
  assert.equal(status("awaiting_confirmation"), false);
});

test("a stage is placed in one place, and a move says where", () => {
  const add = (values: object) =>
    checkProposal({
      action: "design_stage_new",
      title: "x",
      rows: [{ label: "a", name: "MEP", ...values }],
    }).ok;
  assert.equal(add({}), true);
  assert.equal(add({ at_start: true }), true);
  assert.equal(add({ at_start: true, after_stage_id: STAGE }), false);
  const move = (values: object) =>
    checkProposal({
      action: "design_stage_move",
      title: "x",
      rows: [{ label: "a", stage_id: LATER, ...values }],
    }).ok;
  assert.equal(move({}), false);
  assert.equal(move({ after_stage_id: STAGE }), true);
  assert.equal(move({ at_start: false }), false);
});

test("a transmittal starts from one of the villa's sets or a new one, never both or neither", () => {
  const start = (values: object) =>
    checkProposal({
      action: "design_transmittal_new",
      title: "x",
      rows: [{ label: "a", unit_id: VILLA, stage_id: STAGE, ...values }],
    }).ok;
  assert.equal(start({}), false);
  assert.equal(start({ set_id: OTHER }), true);
  assert.equal(start({ set_name: "Ground floor plans" }), true);
  assert.equal(start({ set_id: OTHER, set_name: "Ground floor plans" }), false);
});

test("a stage's people are one save per villa and stage", () => {
  const entry = entryFor("design_stage_start");
  assert.ok(entry);
  const proposal = checkProposal({
    action: "design_stage_start",
    title: "x",
    rows: [
      { label: "a", unit_id: VILLA, stage_id: STAGE, person_id: PERSON },
      { label: "b", unit_id: VILLA, stage_id: STAGE, person_id: SECOND },
      { label: "c", unit_id: OTHER, stage_id: STAGE, person_id: PERSON },
    ],
  });
  assert.ok(proposal.ok);
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
});

test("a new stage sends the two fields Design Management's add form reads", () => {
  // A renamed field would reach the action blank, and silently.
  const source = readFileSync("lib/design-management/stage-actions.ts", "utf8");
  const body = source.slice(
    source.indexOf("export async function addDesignStage"),
    source.indexOf("type Supabase"),
  );
  const read = [...body.matchAll(/text\(formData, "(\w+)"\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(read)].sort(), ["after", "name"]);
  assert.match(
    readFileSync("lib/turing/runners/design-management.ts", "utf8"),
    /form\.set\("name"[\s\S]*form\.set\("after"/,
  );
});
