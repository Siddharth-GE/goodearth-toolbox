import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal, entryFor, recordsOf } from "../catalogue-fields";
import { sheetTotal, type SheetRow } from "./estimator-estimates";

const ESTIMATE = "11111111-1111-4111-8111-111111111111";
const LINE = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const MIX = "44444444-4444-4444-8444-444444444444";
const WORK = "55555555-5555-4555-8555-555555555555";

const ok = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", ...row }] }).ok;

test("a quantity, labour rate or price is given (empty clears it), never left out", () => {
  assert.equal(ok("est_line_qty", { line_id: LINE }), false);
  assert.equal(ok("est_line_qty", { line_id: LINE, qty: "" }), true);
  assert.equal(ok("est_line_qty", { line_id: LINE, qty: 42.375 }), true);
  assert.equal(ok("est_line_labour", { line_id: LINE }), false);
  assert.equal(ok("est_line_labour", { line_id: LINE, labour_rate: 0 }), true);
  assert.equal(ok("est_item_price", { estimate_id: ESTIMATE, item_id: ITEM }), false);
  assert.equal(ok("est_item_price", { estimate_id: ESTIMATE, item_id: ITEM, rate: "" }), true);
});

test("a villa's material names one material or mix, and a swap names one to swap in", () => {
  const base = { line_id: LINE, qty_per_unit: 0.0144 };
  assert.equal(ok("est_line_material", base), false);
  assert.equal(ok("est_line_material", { ...base, item_id: ITEM }), true);
  assert.equal(ok("est_line_material", { ...base, item_id: ITEM, mix_id: MIX }), false);
  assert.equal(ok("est_line_material_swap", { line_id: LINE, item_id: ITEM }), false);
  assert.equal(
    ok("est_line_material_swap", { line_id: LINE, item_id: ITEM, to_mix_id: MIX }),
    true,
  );
});

test("a measurement's boxes are never below zero; a deduction is its own tick", () => {
  assert.equal(ok("est_measure_add", { line_id: LINE, nos: 2, length: 3.5, depth: 0.23 }), true);
  assert.equal(ok("est_measure_add", { line_id: LINE, length: -1.2 }), false);
  assert.equal(ok("est_measure_add", { line_id: LINE, length: 1.2, deduct: true }), true);
});

test("works put on an estimate are one save per estimate", () => {
  const entry = entryFor("est_works_add");
  assert.ok(entry);
  const proposal = checkProposal({
    action: "est_works_add",
    title: "x",
    rows: [
      { label: "a", estimate_id: ESTIMATE, work_item_id: WORK },
      { label: "b", estimate_id: ESTIMATE, work_item_id: ITEM },
    ],
  });
  assert.ok(proposal.ok);
  const records = recordsOf(
    entry,
    proposal.value.rows,
    proposal.value.rows.map((row, index) => ({ index, row })),
  );
  assert.ok(records.ok && records.value.length === 1);
});

test("a measurement row sends the fields the Estimator's add reads, the deduction as its form does", () => {
  // The add reads its own boxes with formData.get, so the shared form test cannot hold it.
  const source = readFileSync("lib/estimator/estimate-actions.ts", "utf8");
  const body = source.slice(
    source.indexOf("export async function addLineMeasurement"),
    source.indexOf("export async function updateLineMeasurement"),
  );
  const read = [...body.matchAll(/text\(formData, "(\w+)"\)|formData\.get\("(\w+)"\)/g)].map(
    (match) => match[1] ?? match[2],
  );
  assert.deepEqual([...new Set(read)].sort(), [
    "breadth",
    "deduct",
    "depth",
    "description",
    "length",
    "nos",
  ]);
  assert.match(body, /formData\.get\("deduct"\) === "1"/);
  assert.match(
    readFileSync("lib/turing/runners/estimator-estimates.ts", "utf8"),
    /form\.set\("deduct", "1"\)/,
  );
});

test("a sheet's total is the Estimator's: each row the product of its boxes, deductions taken off", () => {
  const row = (values: Partial<SheetRow>): SheetRow => ({
    nos: null,
    length: null,
    breadth: null,
    depth: null,
    deduct: false,
    ...values,
  });
  // A wall 4 × 3 m, less a door 0.9 × 2.1 m.
  assert.equal(
    sheetTotal([row({ length: 4, breadth: 3 }), row({ length: 0.9, breadth: 2.1, deduct: true })]),
    10.11,
  );
  assert.equal(sheetTotal([row({ nos: 4, length: 3, depth: 0.15 })]), 1.8);
  assert.equal(sheetTotal([row({ length: 0.9, breadth: 2.1, deduct: true })]) > 0, false);
});

test("a box given is above zero; a rate on a work wants it set up", () => {
  assert.equal(ok("est_measure_add", { line_id: LINE, nos: 0, length: 2 }), false);
  assert.equal(ok("est_measure_change", { row_id: LINE, nos: "" }), true);
  assert.match(String(entryFor("est_line_labour")?.description), /set up in the rate book/);
});
