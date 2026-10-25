import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal, entryFor, recordsOf } from "../catalogue-fields";
import { CHECK_ANSWERS, receivedFor } from "./supervisors-site";

const VILLA = "11111111-1111-4111-8111-111111111111";
const WORK = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const CHECK = "44444444-4444-4444-8444-444444444444";
const ISSUE = "55555555-5555-4555-8555-555555555555";
const LINE = "66666666-6666-4666-8666-666666666666";
const OTHER = "77777777-7777-4777-8777-777777777777";

const ok = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", ...row }] }).ok;

test("the check answers are Supervisors' own", () => {
  const source = readFileSync("lib/supervisors/checklists.ts", "utf8");
  const theirs = source.match(/CHECK_STATUSES = \[([^\]]+)\]/)?.[1];
  assert.ok(theirs);
  assert.deepEqual(
    [...theirs.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    [...CHECK_ANSWERS],
  );
});

test("a material request is standard work unless said, with a quantity", () => {
  const proposal = checkProposal({
    action: "sup_request_new",
    title: "x",
    rows: [{ label: "a", plot_id: VILLA, work_item_id: WORK, item_id: ITEM, quantity: 12 }],
  });
  assert.ok(proposal.ok);
  assert.equal(proposal.value.rows[0].values.work_class, "standard");
  assert.equal(
    ok("sup_request_new", {
      plot_id: VILLA,
      work_item_id: WORK,
      item_id: ITEM,
      quantity: 12,
      work_class: "bonus",
    }),
    false,
  );
  assert.equal(ok("sup_request_new", { plot_id: VILLA, work_item_id: WORK, item_id: ITEM }), false);
});

test("a check's answer can be taken back, never emptied; something must change", () => {
  assert.equal(ok("sup_checklist_answer", { item_id: CHECK }), false);
  assert.equal(ok("sup_checklist_answer", { item_id: CHECK, status: "fail" }), true);
  assert.equal(ok("sup_checklist_answer", { item_id: CHECK, status: "not_checked" }), true);
  assert.equal(ok("sup_checklist_answer", { item_id: CHECK, status: "" }), false);
  assert.equal(ok("sup_checklist_answer", { item_id: CHECK, remarks: "Cover short" }), true);
});

test("the sequence's size and a template's name are given, or say what changes", () => {
  assert.equal(ok("sup_typical_sqft", {}), false);
  assert.equal(ok("sup_typical_sqft", { sqft: "" }), true);
  assert.equal(ok("sup_typical_sqft", { sqft: 2400 }), true);
  assert.equal(ok("sup_template_change", { template_id: CHECK }), false);
  assert.equal(ok("sup_template_change", { template_id: CHECK, name: "" }), false);
  assert.equal(ok("sup_template_change", { template_id: CHECK, note: "" }), true);
  assert.equal(ok("sup_sequence_follows", { group_id: WORK }), false);
  assert.equal(ok("sup_sequence_follows", { group_id: WORK, follows_group_id: "" }), true);
});

test("what reached site is every line of the delivery, once each", () => {
  const sent = [
    { id: "l1", quantity: 10 },
    { id: "l2", quantity: 4 },
  ];
  assert.deepEqual(
    receivedFor(sent, [
      { lineId: "l1", received: 10 },
      { lineId: "l2", received: 3 },
    ]),
    { received: { l1: 10, l2: 3 } },
  );
  assert.ok("error" in receivedFor(sent, [{ lineId: "l1", received: 10 }]));
  assert.ok(
    "error" in
      receivedFor(sent, [
        { lineId: "l1", received: 10 },
        { lineId: "l1", received: 9 },
        { lineId: "l2", received: 4 },
      ]),
  );
  assert.ok("error" in receivedFor(sent, [{ lineId: "l9", received: 1 }]));
});

test("an issue's lines make one confirmation per issue", () => {
  const entry = entryFor("sup_issue_confirm");
  assert.ok(entry);
  const proposal = checkProposal({
    action: "sup_issue_confirm",
    title: "x",
    rows: [
      { label: "a", issue_id: ISSUE, line_id: LINE, received: 10, note: "Two bags torn" },
      { label: "b", issue_id: ISSUE, line_id: OTHER, received: 2, note: "Two bags torn" },
    ],
  });
  assert.ok(proposal.ok);
  const records = recordsOf(
    entry,
    proposal.value.rows,
    proposal.value.rows.map((row, index) => ({ index, row })),
  );
  assert.ok(records.ok);
  assert.equal(records.value.length, 1);
  assert.equal(records.value[0].rows.length, 2);
  assert.equal(records.value[0].header.note, "Two bags torn");
});
