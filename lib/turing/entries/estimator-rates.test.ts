import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal } from "../catalogue-fields";
import { MODEL_MEASURES } from "./estimator-rates";

const WORK = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const MIX = "33333333-3333-4333-8333-333333333333";
const LINE = "44444444-4444-4444-8444-444444444444";

const ok = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", ...row }] }).ok;

test("Turing's ways a model measures a work are the Estimator's own", () => {
  // Restated because Turing may not import the Estimator's rules; a measure added there must be added here.
  const source = readFileSync("lib/estimator/model-takeoff.ts", "utf8");
  const list = source.slice(
    source.indexOf("export const MODEL_MEASURES"),
    source.indexOf("] as const"),
  );
  assert.deepEqual(
    [...list.matchAll(/"(\w+)"/g)].map((match) => match[1]),
    [...MODEL_MEASURES],
  );
});

test("a recipe line names a material or a mix, never both or neither", () => {
  const base = { work_item_id: WORK, qty_per_unit: 8.5 };
  assert.equal(ok("est_work_material", base), false);
  assert.equal(ok("est_work_material", { ...base, item_id: ITEM }), true);
  assert.equal(ok("est_work_material", { ...base, mix_id: MIX }), true);
  assert.equal(ok("est_work_material", { ...base, item_id: ITEM, mix_id: MIX }), false);
});

test("a work's setup says what changes, and a labour rate can be cleared", () => {
  assert.equal(ok("est_work_setup", { work_item_id: WORK }), false);
  assert.equal(ok("est_work_setup", { work_item_id: WORK, labour_rate: "" }), true);
  assert.equal(ok("est_work_setup", { work_item_id: WORK, uom: "" }), false);
  assert.equal(ok("est_work_model", { work_item_id: WORK }), false);
  assert.equal(ok("est_work_model", { work_item_id: WORK, measure: "" }), true);
  assert.equal(ok("est_work_model", { work_item_id: WORK, measure: "weight" }), false);
});

test("refusing an indent line needs the reason the approver reads", () => {
  assert.equal(ok("est_indent_answer", { line_id: LINE, decision: "refused" }), false);
  assert.equal(
    ok("est_indent_answer", { line_id: LINE, decision: "refused", note: "On R2" }),
    true,
  );
  assert.equal(ok("est_indent_answer", { line_id: LINE, decision: "approved" }), true);
});

test("a new mix starts in use, as its form does", () => {
  const proposal = checkProposal({
    action: "est_mix_new",
    title: "x",
    rows: [{ label: "a", name: "M20 concrete", uom: "cum" }],
  });
  assert.ok(proposal.ok && proposal.value.rows[0].values.is_active === true);
});
