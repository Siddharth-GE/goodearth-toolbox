import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal } from "../catalogue-fields";
import { leftToPay, STEPS } from "./cash-requests";

const REQUEST = "11111111-1111-4111-8111-111111111111";
const LINE = "22222222-2222-4222-8222-222222222222";
const BILL = "33333333-3333-4333-8333-333333333333";
const VENDOR = "44444444-4444-4444-8444-444444444444";
const PROJECT = "55555555-5555-4555-8555-555555555555";

const ok = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", ...row }] }).ok;

test("a line's cap is Bills' own: released less paid, never below zero", () => {
  const ledger = readFileSync("lib/bills/ledger.ts", "utf8");
  assert.match(ledger, /Math\.max\(0, roundPaise\(\(line\.released \?\? 0\) - line\.paid\)\)/);
  assert.equal(leftToPay(5000, 2000), 3000);
  assert.equal(leftToPay(null, 0), 0);
  assert.equal(leftToPay(1000, 1500), 0);
  assert.equal(leftToPay(100.1, 0.2), 99.9);
});

test("each step starts where the database's guard lets it", () => {
  const guard = readFileSync("supabase/migrations/0107_payments.sql", "utf8");
  const to = { submit: "submitted", release: "released", send_back: "draft", close: "closed" };
  for (const [step, from] of Object.entries(STEPS))
    assert.ok(
      guard.includes(`old.status = '${from}' and new.status = '${to[step as keyof typeof to]}'`),
      step,
    );
});

test("only sending back takes a note, and it needs one", () => {
  const step = { request_id: REQUEST };
  assert.equal(ok("cash_request_step", { ...step, step: "submit" }), true);
  assert.equal(ok("cash_request_step", { ...step, step: "submit", note: "x" }), false);
  assert.equal(ok("cash_request_step", { ...step, step: "send_back" }), false);
  assert.equal(ok("cash_request_step", { ...step, step: "send_back", note: "Cut Saju" }), true);
  assert.equal(ok("cash_request_step", { ...step, step: "approve" }), false);
});

test("a line's amount may be cut to zero, to the paise", () => {
  assert.equal(ok("cash_request_amount", { item_id: LINE, amount: "0" }), true);
  assert.equal(ok("cash_request_amount", { item_id: LINE, amount: "25000.50" }), true);
  assert.equal(ok("cash_request_amount", { item_id: LINE, amount: "100.005" }), false);
  assert.equal(ok("cash_request_amount", { item_id: LINE, amount: "-5" }), false);
});

test("money asked for or paid is rupees above zero, to the paise", () => {
  const bill = { request_id: REQUEST, bill_id: BILL };
  assert.equal(ok("cash_request_bill", { ...bill, amount: "25000.50" }), true);
  assert.equal(ok("cash_request_bill", { ...bill, amount: "0" }), false);
  const advance = { request_id: REQUEST, vendor_id: VENDOR, project_id: PROJECT };
  assert.equal(ok("cash_request_advance", { ...advance, amount: "10000" }), true);
  assert.equal(ok("cash_request_advance", { ...advance, amount: "10000.001" }), false);
  const pay = { item_id: LINE, paid_on: "2026-10-26", reference: "UTR123" };
  assert.equal(ok("cash_request_pay", { ...pay, amount: "5000" }), true);
  assert.equal(ok("cash_request_pay", { ...pay, amount: "0" }), false);
  assert.equal(ok("cash_request_pay", { ...pay, amount: "5000", reference: "" }), false);
});

test("a note is given, or given empty to clear it", () => {
  assert.equal(ok("cash_request_note", { request_id: REQUEST }), false);
  assert.equal(ok("cash_request_note", { request_id: REQUEST, note: "" }), true);
  assert.equal(ok("cash_request_note", { request_id: REQUEST, note: "Urgent: Saju" }), true);
});
