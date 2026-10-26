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
  const rows = proposal.value.rows;
  const records = recordsOf(
    proposal.value.entry,
    rows,
    rows.map((row, index) => ({ index, row })),
  );
  assert.ok(records.ok);
  assert.equal(records.value.length, 2);
  assert.deepEqual(
    records.value[0].rows.map(({ index }) => index),
    [0, 2],
  );
  assert.equal(records.value[0].header.plot_id, PLOT);
  // Left out, the urgent mark and the send start as the screen's do: no.
  assert.equal(records.value[0].header.is_urgent, false);
  assert.equal(records.value[0].header.submit, false);
  assert.equal("item_id" in records.value[0].header, false);
});

const base = { project_id: PROJECT, plot_id: PLOT, is_urgent: false, submit: false };
const line = (label: string, values: Record<string, string | boolean>) => ({
  label,
  values: { ...base, item_id: CEMENT, quantity: "1", ...values },
});

test("a header field that differs makes a separate indent; left out and empty do not", () => {
  const entry = entryFor("indent_new")!;
  const two = [line("a", {}), line("b", { is_urgent: true })];
  const split = recordsOf(
    entry,
    two,
    two.map((row, index) => ({ index, row })),
  );
  assert.ok(split.ok && split.value.length === 2);
  const one = [line("a", { note: "" }), line("b", {})];
  const same = recordsOf(
    entry,
    one,
    one.map((row, index) => ({ index, row })),
  );
  assert.ok(same.ok && same.value.length === 1);
});

test("the admin's edits can neither merge two proposed indents nor split one", () => {
  const entry = entryFor("indent_new")!;
  const proposed = [line("a", {}), line("b", { is_urgent: true })];
  // Ticking Urgent on a to match b keeps them two indents.
  const matched = recordsOf(entry, proposed, [
    { index: 0, row: line("a", { is_urgent: true }) },
    { index: 1, row: proposed[1] },
  ]);
  assert.ok(matched.ok && matched.value.length === 2);
  // One line of an indent saved with a different date is refused.
  const together = [line("a", {}), line("b", {})];
  const apart = recordsOf(entry, together, [
    { index: 0, row: line("a", { required_by: "2026-11-02" }) },
    { index: 1, row: together[1] },
  ]);
  assert.ok(!apart.ok && /lines of one indent must share/.test(apart.error));
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
      "rows with the same project_id, plot_id, work_group_id, work_item_id, required_by, is_urgent, note, submit make one record",
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
