import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cashRequestFigures,
  contractorLedger,
  contractorPosition,
  lineLeftToPay,
  mondayOf,
  moneyReversal,
  paymentProblem,
} from "./ledger";

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

test("a cash request: asked, released (one cut), paid, still to pay", () => {
  const figures = cashRequestFigures([
    { requested: 1500000, released: 1000000, paid: 600000 },
    { requested: 1000000, released: 1000000, paid: 1000000 },
    { requested: 50000, released: null, paid: 0 },
  ]);
  assert.equal(figures.requested, 2550000);
  assert.equal(figures.released, 2000000);
  assert.equal(figures.paid, 1600000);
  assert.equal(figures.toPay, 400000);
  assert.equal(lineLeftToPay({ requested: 10, released: 5, paid: 9 }), 0);
});

test("a payment's refusals, said first", () => {
  const ok = { amount: 50000, reference: "UTR1", pending: 50000 };
  assert.equal(paymentProblem(ok), undefined);
  assert.match(paymentProblem({ ...ok, amount: 0 }) ?? "", /more than zero/);
  assert.match(paymentProblem({ ...ok, reference: " " }) ?? "", /UTR/);
  assert.match(paymentProblem({ ...ok, amount: 50001 }) ?? "", /pending/);
  assert.match(paymentProblem({ ...ok, cap: 40000 }) ?? "", /released/);
  assert.equal(paymentProblem({ ...ok, cap: null }), undefined);
});

test("money is reversed once, by an approver, and an advance only once nothing is recovered", () => {
  const approver = { isAdmin: false, isApprover: true };
  const entry = { kind: "payment" as const, reversal: false, reversed: false };
  assert.deepEqual(moneyReversal(entry, approver), { kind: "cancel" });
  assert.deepEqual(moneyReversal(entry, { isAdmin: true, isApprover: false }), { kind: "cancel" });
  assert.equal(moneyReversal(entry, { isAdmin: false, isApprover: false }), null);
  assert.equal(moneyReversal({ ...entry, reversed: true }, approver), null);
  assert.equal(moneyReversal({ ...entry, reversal: true }, approver), null);

  const advance = { kind: "advance" as const, reversal: false, reversed: false };
  assert.deepEqual(moneyReversal({ ...advance, recovered: 0 }, approver), { kind: "cancel" });
  const blocked = moneyReversal({ ...advance, recovered: 25000 }, approver);
  assert.equal(blocked?.kind, "blocked");
  assert.match(
    blocked?.kind === "blocked" ? blocked.why : "",
    /25,000\.00 of it has been recovered/,
  );
});

test("a contractor's ledger: bills add, payments and advances take away, a recovery moves nothing", () => {
  const rows = contractorLedger([
    { id: "p1", kind: "payment", on: "2026-10-12", amount: 60000 },
    { id: "a1", kind: "advance", on: "2026-10-01", amount: 50000 },
    { id: "b1", kind: "bill", on: "2026-10-12", amount: 100000 },
    { id: "r1", kind: "recovery", on: "2026-10-12", amount: 40000 },
    { id: "p2", kind: "payment", on: "2026-10-20", amount: -60000 },
  ]);
  assert.deepEqual(
    rows.map((row) => [row.id, row.balance]),
    [
      ["a1", -50000],
      ["b1", 50000],
      ["p1", -10000],
      ["r1", -10000],
      // A reversed payment puts what it paid back on what is owed.
      ["p2", 50000],
    ],
  );
});
