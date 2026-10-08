import assert from "node:assert/strict";
import { test } from "node:test";

import { contractorPosition, mondayOf } from "./ledger";

test("a cash request's week starts on Monday", () => {
  assert.equal(mondayOf("2026-10-08"), "2026-10-05"); // a Thursday
  assert.equal(mondayOf("2026-10-05"), "2026-10-05"); // a Monday
  assert.equal(mondayOf("2026-10-11"), "2026-10-05"); // a Sunday ends the week
  assert.equal(mondayOf("2026-01-01"), "2025-12-29"); // across a year
});

test("₹25 lakh billed, ₹20 lakh released: ₹5 lakh stays pending", () => {
  const position = contractorPosition(
    [
      { total: 1500000, paid: 1000000, recovered: 0 },
      { total: 1000000, paid: 1000000, recovered: 0 },
    ],
    [],
  );
  assert.equal(position.billed, 2500000);
  assert.equal(position.paid, 2000000);
  assert.equal(position.pending, 500000);
});

test("advances: given, recovered from bills, still out", () => {
  const position = contractorPosition(
    [{ total: 150000, paid: 100000, recovered: 25000 }],
    [
      { amount: 40000, recovered: 25000 },
      { amount: 10000, recovered: 0 },
    ],
  );
  assert.equal(position.pending, 25000);
  assert.equal(position.advancesGiven, 50000);
  assert.equal(position.advancesRecovered, 25000);
  assert.equal(position.advancesOutstanding, 25000);
});
