import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal } from "../catalogue-fields";
import { FACILITY_KINDS, MOVEMENT_KINDS } from "./money";

const BILL = "11111111-1111-4111-8111-111111111111";
const ADVANCE = "22222222-2222-4222-8222-222222222222";
const PAYMENT = "33333333-3333-4333-8333-333333333333";
const FACILITY = "44444444-4444-4444-8444-444444444444";

const ok = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", ...row }] }).ok;

test("the facility and movement kinds are Financial Management's own", () => {
  const source = readFileSync("lib/financial-management/kinds.ts", "utf8");
  const list = (name: string) =>
    [
      ...(source.match(new RegExp(`${name} = \\[([^\\]]+)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g),
    ].map((m) => m[1]);
  assert.deepEqual(list("FACILITY_KINDS"), [...FACILITY_KINDS]);
  assert.deepEqual(list("MOVEMENT_KINDS"), [...MOVEMENT_KINDS]);
});

test("a payment has an amount, a day and a reference", () => {
  const pay = { bill_id: BILL, amount: 25000, paid_on: "2026-10-24", reference: "UTR123" };
  assert.equal(ok("bill_payment", pay), true);
  assert.equal(ok("bill_payment", { ...pay, reference: "" }), false);
  assert.equal(ok("bill_payment", { ...pay, amount: "-5" }), false);
  assert.equal(ok("bill_payment", { ...pay, paid_on: "2026-02-30" }), false);
});

test("a reversal names exactly one entry, with a reason", () => {
  assert.equal(ok("money_reverse", { reason: "Paid twice" }), false);
  assert.equal(ok("money_reverse", { payment_id: PAYMENT, reason: "Paid twice" }), true);
  assert.equal(ok("money_reverse", { payment_id: PAYMENT }), false);
  assert.equal(
    ok("money_reverse", { payment_id: PAYMENT, advance_id: ADVANCE, reason: "Paid twice" }),
    false,
  );
});

test("a facility's rate is at most 100% a year, and a change says what changes", () => {
  const facility = { party: "Federal Bank", kind: "bank_loan" };
  assert.equal(ok("facility_new", facility), true);
  assert.equal(ok("facility_new", { ...facility, interest_rate_pct: 10.5 }), true);
  assert.equal(ok("facility_new", { ...facility, interest_rate_pct: 105 }), false);
  assert.equal(ok("facility_new", { ...facility, kind: "grant" }), false);
  assert.equal(ok("facility_change", { facility_id: FACILITY }), false);
  assert.equal(ok("facility_change", { facility_id: FACILITY, party: "" }), false);
  assert.equal(ok("facility_change", { facility_id: FACILITY, terms: "" }), true);
});
