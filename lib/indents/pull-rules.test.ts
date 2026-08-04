/**
 * The pull-safety rules. What these protect: material never being
 * requested against a superseded design revision (the double-buy bug),
 * and the "design revised since this was requested" badge telling the
 * truth on lines that were pulled before a revision landed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyBudgetChooser,
  classifyDesignDrift,
  type BudgetCandidate,
  type DriftLine,
  type IssuedRevision,
} from "./pull-rules";

const budget = (id: string, unit: string, selection: string): BudgetCandidate => ({
  budget_id: id,
  unit_id: unit,
  selection_id: selection,
  version: 1,
  approved_at: "2026-08-01",
});

const issued = (selection: string, revision: number): IssuedRevision => ({
  selection_id: selection,
  revision_no: revision,
});

test("the issued revision's budget is pullable, the superseded one is not", () => {
  const rows = classifyBudgetChooser(
    [budget("b-r1", "villa", "sel-r1"), budget("b-r2", "villa", "sel-r2")],
    new Map([["villa", issued("sel-r2", 2)]]),
  );
  assert.equal(rows.length, 1);
  assert.ok(rows[0].kind === "pullable");
  assert.equal(rows[0].budget.budget_id, "b-r2");
  assert.equal(rows[0].revision_no, 2);
});

test("a unit whose new revision has no approved budget yet shows one pending row", () => {
  // R2 is issued but only R1's budget is approved — the unit is paused,
  // not silently offered the old design.
  const rows = classifyBudgetChooser(
    [budget("b-r1-v1", "villa", "sel-r1"), budget("b-r1-v2", "villa", "sel-r1")],
    new Map([["villa", issued("sel-r2", 2)]]),
  );
  assert.deepEqual(rows, [{ kind: "pending", unit_id: "villa", revision_no: 2 }]);
});

test("units classify independently", () => {
  const rows = classifyBudgetChooser(
    [budget("b-a", "unit-a", "sel-a1"), budget("b-b", "unit-b", "sel-b1")],
    new Map([
      ["unit-a", issued("sel-a1", 1)],
      ["unit-b", issued("sel-b2", 2)],
    ]),
  );
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["pullable", "pending"],
  );
});

test("a unit with no issued revision contributes nothing", () => {
  const rows = classifyBudgetChooser([budget("b", "villa", "sel-r1")], new Map());
  assert.deepEqual(rows, []);
});

const line = (key: string, item: string, quantity: number, space: string): DriftLine => ({
  line_key: key,
  item_id: item,
  quantity,
  unit_space_id: space,
});

test("drift: untouched lines are absent from the map", () => {
  const lines = [line("a", "sofa", 2, "living")];
  const drift = classifyDesignDrift(["a"], lines, lines);
  assert.equal(drift.size, 0);
});

test("drift: quantity change, item swap and space move all count as changed", () => {
  const anchored = [
    line("qty", "sofa", 2, "living"),
    line("swap", "sofa", 1, "living"),
    line("move", "sofa", 1, "living"),
  ];
  const latest = [
    line("qty", "sofa", 5, "living"),
    line("swap", "armchair", 1, "living"),
    line("move", "sofa", 1, "bed1"),
  ];
  const drift = classifyDesignDrift(["qty", "swap", "move"], anchored, latest);
  assert.equal(drift.get("qty"), "changed");
  assert.equal(drift.get("swap"), "changed");
  assert.equal(drift.get("move"), "changed");
});

test("drift: a line gone from the latest revision is removed", () => {
  const drift = classifyDesignDrift(["gone"], [line("gone", "sofa", 1, "living")], []);
  assert.equal(drift.get("gone"), "removed");
});

test("drift: only the asked-about keys are classified", () => {
  // The latest revision may have added lines the indent never touched —
  // they are not drift on this indent.
  const drift = classifyDesignDrift(
    ["mine"],
    [line("mine", "sofa", 1, "living")],
    [line("mine", "sofa", 1, "living"), line("new", "lamp", 2, "bed1")],
  );
  assert.equal(drift.size, 0);
});
