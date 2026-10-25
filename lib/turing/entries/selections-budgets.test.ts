import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProposal, entryFor, recordsOf } from "../catalogue-fields";

const DRAFT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SPACE = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";
const LINE = "55555555-5555-4555-8555-555555555555";

const ok = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", ...row }] }).ok;

test("items for two revisions are two saves, whatever spaces they go into", () => {
  const entry = entryFor("sel_lines");
  assert.ok(entry);
  const proposal = checkProposal({
    action: "sel_lines",
    title: "x",
    rows: [
      { label: "a", selection_id: DRAFT, space_id: SPACE, item_id: ITEM, quantity: 2 },
      { label: "b", selection_id: DRAFT, space_id: OTHER, item_id: ITEM, quantity: 1.5 },
      { label: "c", selection_id: OTHER, space_id: SPACE, item_id: ITEM, quantity: 1 },
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

test("a line change says what changes, and its unit is the item's", () => {
  assert.equal(ok("sel_line_change", { line_id: LINE }), false);
  assert.equal(ok("sel_line_change", { line_id: LINE, note: "" }), true);
  assert.equal(ok("sel_line_change", { line_id: LINE, quantity: "" }), false);
  assert.equal(
    entryFor("sel_line_change")?.fields.some((field) => field.key === "uom"),
    false,
  );
});

test("a caption or a default margin is given (empty clears it), never left out", () => {
  const VIEW = OTHER;
  assert.equal(ok("sel_view_caption", { view_id: VIEW }), false);
  assert.equal(ok("sel_view_caption", { view_id: VIEW, caption: "" }), true);
  assert.equal(ok("budget_margin", { item_id: ITEM }), false);
  assert.equal(ok("budget_margin", { item_id: ITEM, margin_pct: "" }), true);
  assert.equal(ok("budget_margin", { item_id: ITEM, margin_pct: 18 }), true);
  assert.equal(ok("budget_margin", { item_id: ITEM, margin_pct: -5 }), false);
});

test("a budget line keeps what is left out, and takes no negative cost", () => {
  const base = { budget_id: DRAFT, line_id: LINE };
  const priced = checkProposal({
    action: "budget_line",
    title: "x",
    rows: [{ label: "a", ...base, unit_cost: 1250.5 }],
  });
  assert.ok(priced.ok);
  assert.deepEqual(Object.keys(priced.value.rows[0].values).sort(), [
    "budget_id",
    "line_id",
    "unit_cost",
  ]);
  assert.equal(ok("budget_line", { ...base, unit_cost: -1 }), false);
  assert.equal(ok("budget_line", { ...base, quantity: "" }), false);
  assert.equal(ok("budget_line", { ...base, vendor_id: "" }), true);
});
