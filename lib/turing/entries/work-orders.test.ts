import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProposal, recordsOf } from "../catalogue-fields";
import { workLineOf } from "./work-orders";

const WORK = "11111111-1111-4111-8111-111111111111";
const VENDOR = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const LINE = "44444444-4444-4444-8444-444444444444";
const BOOK = { name: "Brickwork 230mm", uom: "cum", labour_rate: 1200 };

test("a work picked from the list brings its name, unit and labour rate, as the editor fills them", () => {
  assert.deepEqual(workLineOf({ work_item_id: WORK, quantity: "12" }, BOOK), {
    workItemId: WORK,
    description: "Brickwork 230mm",
    isLumpSum: false,
    quantity: 12,
    uom: "cum",
    rate: 1200,
  });
  // What is given wins over the rate book.
  assert.deepEqual(
    workLineOf(
      { work_item_id: WORK, quantity: "2", rate: "1100", line_description: "Parapet" },
      BOOK,
    ),
    {
      workItemId: WORK,
      description: "Parapet",
      isLumpSum: false,
      quantity: 2,
      uom: "cum",
      rate: 1100,
    },
  );
});

test("a lump sum has its amount as the rate and no quantity or unit; never the rate book's rate", () => {
  assert.deepEqual(workLineOf({ work_item_id: WORK, lump_sum: true }, BOOK), {
    workItemId: WORK,
    description: "Brickwork 230mm",
    isLumpSum: true,
    quantity: null,
    uom: null,
    rate: null,
  });
  assert.equal(
    workLineOf({ line_description: "Scaffolding", lump_sum: true, rate: "25000" }, undefined).rate,
    25000,
  );
});

test("a change keeps what it doesn't give", () => {
  const now = {
    workItemId: WORK,
    description: "Brickwork 230mm",
    isLumpSum: false,
    quantity: 12,
    uom: "cum",
    rate: 1200,
  };
  assert.deepEqual(workLineOf({ line_id: LINE, rate: "1250" }, undefined, now), {
    ...now,
    rate: 1250,
  });
  // Turned into a lump sum, the old per-unit rate is not its amount.
  assert.equal(workLineOf({ line_id: LINE, lump_sum: true }, undefined, now).rate, null);
});

test("a new work order's rows are one order per header", () => {
  const header = { project_id: PROJECT, vendor_id: VENDOR, description: "Brickwork, plot 4" };
  const proposal = checkProposal({
    action: "work_order_new",
    title: "x",
    rows: [
      { label: "a", ...header, work_item_id: WORK, quantity: 12 },
      { label: "b", ...header, line_description: "Scaffolding", lump_sum: true, rate: 25000 },
    ],
  });
  assert.ok(proposal.ok);
  const rows = proposal.value.rows;
  const records = recordsOf(
    proposal.value.entry,
    rows,
    rows.map((row, index) => ({ index, row })),
  );
  assert.ok(records.ok && records.value.length === 1);
  // Terms left out stay out, so the default terms apply.
  assert.equal("terms" in rows[0].values, false);
});

test("an order's work changes are one save; a removed work takes no changes; a lump sum no quantity", () => {
  const ORDER = "55555555-5555-4555-8555-555555555555";
  const OTHER_LINE = "66666666-6666-4666-8666-666666666666";
  const proposal = checkProposal({
    action: "work_order_works_change",
    title: "x",
    rows: [
      { label: "a", work_order_id: ORDER, line_id: LINE, rate: 1250 },
      { label: "b", work_order_id: ORDER, line_id: OTHER_LINE, remove: true },
    ],
  });
  assert.ok(proposal.ok);
  const rows = proposal.value.rows;
  const records = recordsOf(
    proposal.value.entry,
    rows,
    rows.map((row, index) => ({ index, row })),
  );
  assert.ok(records.ok && records.value.length === 1);

  const both = checkProposal({
    action: "work_order_works_change",
    title: "x",
    rows: [{ label: "a", work_order_id: ORDER, line_id: LINE, remove: true, rate: 1 }],
  });
  assert.ok(!both.ok && /takes no changes/.test(both.error));
  const lump = checkProposal({
    action: "work_order_works_add",
    title: "x",
    rows: [
      { label: "a", work_order_id: ORDER, line_description: "x", lump_sum: true, quantity: 3 },
    ],
  });
  assert.ok(!lump.ok && /no quantity or unit/.test(lump.error));
});
