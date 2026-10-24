import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogueText, checkProposal, ENTRIES, entryFor, recordsOf } from "../catalogue-fields";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const PLOT = "22222222-2222-4222-8222-222222222222";
const OTHER_PLOT = "33333333-3333-4333-8333-333333333333";
const CEMENT = "44444444-4444-4444-8444-444444444444";
const SAND = "55555555-5555-4555-8555-555555555555";

test("an entry with lines has both header fields and line fields", () => {
  for (const entry of ENTRIES) {
    if (!entry.lines) continue;
    assert.ok(
      entry.fields.some((field) => field.header),
      entry.key,
    );
    assert.ok(
      entry.fields.some((field) => !field.header),
      entry.key,
    );
  }
});

test("lines with the same header are one indent, in the order they first appear", () => {
  const proposal = checkProposal({
    action: "indent_new",
    title: "From the site's note",
    rows: [
      { label: "P-07 cement", project_id: PROJECT, plot_id: PLOT, item_id: CEMENT, quantity: 40 },
      { label: "P-09 sand", project_id: PROJECT, plot_id: OTHER_PLOT, item_id: SAND, quantity: 3 },
      { label: "P-07 sand", project_id: PROJECT, plot_id: PLOT, item_id: SAND, quantity: 2.5 },
    ],
  });
  assert.ok(proposal.ok);
  const records = recordsOf(
    proposal.value.entry,
    proposal.value.rows.map((row, index) => ({ index, row })),
  );
  assert.equal(records.length, 2);
  assert.deepEqual(
    records[0].rows.map(({ index }) => index),
    [0, 2],
  );
  assert.equal(records[0].header.plot_id, PLOT);
  // Left out, the urgent mark and the send start as the screen's do: no.
  assert.equal(records[0].header.is_urgent, false);
  assert.equal(records[0].header.submit, false);
  assert.equal("item_id" in records[0].header, false);
});

test("a header field that differs makes a separate indent", () => {
  const entry = entryFor("indent_new")!;
  const base = { project_id: PROJECT, plot_id: PLOT, is_urgent: false, submit: false };
  const records = recordsOf(entry, [
    { row: { label: "a", values: { ...base, item_id: CEMENT, quantity: "1" } } },
    { row: { label: "b", values: { ...base, is_urgent: true, item_id: SAND, quantity: "1" } } },
  ]);
  assert.equal(records.length, 2);
});

test("an indent line needs an item and a quantity; a reason only off the estimate", () => {
  const bad = checkProposal({
    action: "indent_lines_add",
    title: "x",
    rows: [
      { label: "a", indent_id: PROJECT, item_id: CEMENT },
      { label: "b", indent_id: PROJECT, item_id: CEMENT, quantity: "40 bags" },
    ],
  });
  assert.ok(!bad.ok);
  assert.match(bad.error, /Row 1: Quantity is missing/);
  assert.match(bad.error, /Row 2: Quantity is a number/);
});

test("Claude is told which fields make one record", () => {
  assert.ok(
    catalogueText().includes(
      "rows with the same project_id, plot_id, work_item_id, required_by, is_urgent, note, submit make one record",
    ),
  );
});

test("a cancel needs its reason; a line change can keep its quantity but not empty it", () => {
  assert.equal(
    checkProposal({
      action: "indent_cancel",
      title: "x",
      rows: [{ label: "a", indent_id: PROJECT }],
    }).ok,
    false,
  );
  const change = checkProposal({
    action: "indent_line_change",
    title: "x",
    rows: [{ label: "a", line_id: PROJECT, quantity: "" }],
  });
  assert.ok(!change.ok && /Quantity can be left as it is, but not emptied/.test(change.error));
});
