import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupSheetMoney,
  isContractorLabourBill,
  readConsolidateResult,
  sheetState,
  spreadOldestFirst,
  type SheetMoneyRow,
} from "./sheets";

test("a sheet reads as waiting, approved, paid or undone", () => {
  assert.equal(sheetState("recorded", 2000, 2000), "waiting");
  assert.equal(sheetState("approved", 2000, 500), "approved");
  assert.equal(sheetState("approved", 2000, 0), "paid");
  assert.equal(sheetState("undone", 2000, 2000), "undone");
  // A sheet with nothing on it is never "paid".
  assert.equal(sheetState("approved", 0, 0), "approved");
});

test("only a contractor's labour bill goes on a sheet", () => {
  assert.equal(isContractorLabourBill({ kind: "nmr", vendorIsContractor: true }), true);
  assert.equal(isContractorLabourBill({ kind: "nmr", vendorIsContractor: false }), false);
  assert.equal(isContractorLabourBill({ kind: "contract", vendorIsContractor: true }), false);
  assert.equal(isContractorLabourBill({ kind: "po", vendorIsContractor: true }), false);
});

test("a payment pays the oldest bill first, skipping what is already paid", () => {
  const bills = [
    { id: "a", pending: 900 },
    { id: "paid", pending: 0 },
    { id: "b", pending: 1100 },
  ];
  assert.deepEqual(spreadOldestFirst(1500, bills), {
    parts: [
      { id: "a", amount: 900 },
      { id: "b", amount: 600 },
    ],
    left: 0,
  });
  assert.deepEqual(spreadOldestFirst(2600, bills).left, 600);
  assert.deepEqual(spreadOldestFirst(0.1 + 0.2, [{ id: "a", pending: 0.3 }]), {
    parts: [{ id: "a", amount: 0.3 }],
    left: 0,
  });
});

test("the database's answer is read only when it has the right shape", () => {
  const good = {
    sheets: [{ id: "s", reference: "THIN-PW-EF-C01", added: 2 }],
    skipped: [{ id: "x", reference: null, reason: "no longer exists" }],
  };
  assert.deepEqual(readConsolidateResult(good), good);
  assert.equal(readConsolidateResult(null), null);
  assert.equal(readConsolidateResult({ sheets: [{ id: "s" }], skipped: [] }), null);
  assert.equal(readConsolidateResult({ sheets: [] }), null);
});

test("a sheet's money reads as the payments made, each over its bills", () => {
  const row = (over: Partial<SheetMoneyRow>): SheetMoneyRow => ({
    id: "1",
    entry: "e1",
    amount: 900,
    on: "2026-10-29",
    reference: "UTR-1",
    reversesId: null,
    reason: null,
    by: "Rajina N",
    ...over,
  });
  const entries = groupSheetMoney([
    row({ id: "1", amount: 900 }),
    row({ id: "2", amount: 600 }),
    row({
      id: "3",
      entry: "e2",
      amount: -900,
      reversesId: "1",
      reason: "Wrong account",
      on: "2026-10-30",
    }),
    row({
      id: "4",
      entry: "e2",
      amount: -600,
      reversesId: "2",
      reason: "Wrong account",
      on: "2026-10-30",
    }),
  ]);
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => [entry.amount, entry.bills, entry.reversal, entry.reversed]),
    [
      [1500, 2, false, true],
      [-1500, 2, true, false],
    ],
  );
});
