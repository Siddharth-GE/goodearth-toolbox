/**
 * The facility arithmetic. Outstanding principal and accrued interest —
 * numbers that will sit next to a bank's own statement, so the edges
 * matter more than usual.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { facilityPosition, type MovementInput } from "./interest";

const TODAY = "2026-08-13";

const draw = (amount: number, happenedOn: string): MovementInput => ({
  kind: "drawdown",
  amount,
  happenedOn,
});
const repay = (amount: number, happenedOn: string): MovementInput => ({
  kind: "repayment",
  amount,
  happenedOn,
});
const interest = (amount: number, happenedOn: string): MovementInput => ({
  kind: "interest",
  amount,
  happenedOn,
});

test("no movements means zero everywhere, not null", () => {
  const p = facilityPosition([], 12, TODAY);
  assert.equal(p.drawn, 0);
  assert.equal(p.outstanding, 0);
  assert.equal(p.accrued, 0);
  assert.equal(p.accruedGap, 0);
  assert.equal(p.isSettled, false);
});

test("a facility with no rate gets a dash, never a zero", () => {
  const p = facilityPosition([draw(100_000, "2026-01-15")], null, TODAY);
  assert.equal(p.accrued, null);
  assert.equal(p.accruedGap, null);
  assert.equal(p.outstanding, 100_000);
});

test("a lone drawdown accrues one month's interest per completed month", () => {
  // Jan..Jul are the completed months before an August `today` — seven
  // months at 1% of 1,00,000.
  const p = facilityPosition([draw(100_000, "2026-01-15")], 12, TODAY);
  assert.equal(p.accrued, 7000);
});

test("the current month has not finished, so it has not accrued", () => {
  const p = facilityPosition([draw(100_000, "2026-08-01")], 12, TODAY);
  assert.equal(p.accrued, 0);
});

test("a mid-month drawdown is charged the full month — the stated limit", () => {
  const janLast = facilityPosition([draw(100_000, "2026-01-31")], 12, "2026-02-10");
  const janFirst = facilityPosition([draw(100_000, "2026-01-01")], 12, "2026-02-10");
  assert.equal(janLast.accrued, janFirst.accrued);
  assert.equal(janLast.accrued, 1000);
});

test("a repayment lowers the principal from its month onward", () => {
  // Jan, Feb at 1,00,000 (1000 each); Mar..Jul at 50,000 (500 each).
  const p = facilityPosition([draw(100_000, "2026-01-05"), repay(50_000, "2026-03-10")], 12, TODAY);
  assert.equal(p.accrued, 2000 + 2500);
  assert.equal(p.outstanding, 50_000);
});

test("repaying to zero stops the accrual and settles the facility", () => {
  // Only January accrues; Feb..Jul sit at zero principal.
  const p = facilityPosition(
    [draw(100_000, "2026-01-05"), repay(100_000, "2026-02-20")],
    12,
    TODAY,
  );
  assert.equal(p.accrued, 1000);
  assert.equal(p.isSettled, true);
});

test("interest paid is its own ledger and never touches principal", () => {
  const p = facilityPosition(
    [draw(100_000, "2026-01-05"), interest(3000, "2026-04-01")],
    12,
    TODAY,
  );
  assert.equal(p.outstanding, 100_000);
  assert.equal(p.interestPaid, 3000);
  assert.equal(p.accrued, 7000);
  assert.equal(p.accruedGap, 4000);
});

test("paying more interest than the formula says goes negative, never clamped", () => {
  const p = facilityPosition(
    [draw(100_000, "2026-06-05"), interest(5000, "2026-07-01")],
    12,
    TODAY,
  );
  // Jun and Jul completed: 2000 accrued, 5000 paid.
  assert.equal(p.accrued, 2000);
  assert.equal(p.accruedGap, -3000);
});

test("over-repayment shows a negative outstanding and accrues nothing on it", () => {
  const p = facilityPosition([draw(50_000, "2026-01-05"), repay(80_000, "2026-02-10")], 12, TODAY);
  // The mistake stays visible…
  assert.equal(p.outstanding, -30_000);
  // …but interest on a negative balance is nonsense: only January accrues.
  assert.equal(p.accrued, 500);
});

test("order of events inside a month does not change the month-end answer", () => {
  const oneWay = facilityPosition(
    [draw(100_000, "2026-01-05"), repay(40_000, "2026-01-20")],
    12,
    "2026-03-01",
  );
  const otherWay = facilityPosition(
    [repay(40_000, "2026-01-05"), draw(100_000, "2026-01-20")],
    12,
    "2026-03-01",
  );
  assert.equal(oneWay.accrued, otherWay.accrued);
  assert.equal(oneWay.accrued, 1200);
});

test("the December to January boundary walks correctly", () => {
  const p = facilityPosition([draw(100_000, "2025-11-15")], 12, "2026-02-10");
  // Nov, Dec, Jan completed.
  assert.equal(p.accrued, 3000);
});
