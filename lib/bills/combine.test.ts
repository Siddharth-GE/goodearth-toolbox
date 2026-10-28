import assert from "node:assert/strict";
import { test } from "node:test";

import { combineProblem, keptBill, type CombineCandidate } from "./combine";

const bill = (over: Partial<CombineCandidate> = {}): CombineCandidate => ({
  id: "a",
  reference: "KASH-NMR-EF-07",
  status: "recorded",
  createdAt: "2026-10-28T05:38:00Z",
  total: 1000,
  hasMoney: false,
  onCashRequest: false,
  hasCharges: false,
  totalByHand: false,
  lineCount: 2,
  ...over,
});

test("a recorded or approved bill with lines and nothing else on it can be combined", () => {
  assert.equal(combineProblem(bill()), undefined);
  assert.equal(combineProblem(bill({ status: "approved" })), undefined);
});

test("each thing that keeps a bill out is said", () => {
  assert.match(combineProblem(bill({ status: "paid" })) ?? "", /paid/);
  assert.match(combineProblem(bill({ hasMoney: true })) ?? "", /Money/);
  assert.match(combineProblem(bill({ onCashRequest: true })) ?? "", /cash request/);
  assert.match(combineProblem(bill({ hasCharges: true })) ?? "", /additional charges/);
  assert.match(combineProblem(bill({ totalByHand: true })) ?? "", /by hand/);
  assert.match(combineProblem(bill({ lineCount: 0 })) ?? "", /no lines/);
});

test("the oldest bill keeps its number, ties broken by id as the database does", () => {
  const older = bill({ id: "z", createdAt: "2026-10-28T05:38:00Z" });
  const newer = bill({ id: "b", createdAt: "2026-10-28T06:10:00Z" });
  assert.equal(keptBill([newer, older])?.id, "z");
  const twin = bill({ id: "c", createdAt: older.createdAt });
  assert.equal(keptBill([older, twin])?.id, "c");
  assert.equal(keptBill([]), undefined);
});
