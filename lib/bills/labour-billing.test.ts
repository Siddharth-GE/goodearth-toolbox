import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dailyWagesTotal,
  describeEntry,
  dayRatesProblem,
  entriesProblem,
  headsOf,
  pieceRatesPayload,
  pieceWorkTotal,
  suggestedPieceRate,
  type LabourEntry,
} from "./labour-billing";

const entry = (over: Partial<LabourEntry> = {}): LabourEntry => ({
  id: "a",
  kind: "nmr",
  contractorId: "rajan",
  projectId: "saarang",
  companyId: "ef",
  workItemId: "fd15",
  masons: 2,
  helpers: 3,
  others: 0,
  quantity: null,
  ...over,
});

test("one kind, one contractor, one company per bill; one project against a work order", () => {
  assert.equal(entriesProblem([entry(), entry({ id: "b" })]), undefined);
  assert.match(entriesProblem([]) ?? "", /Tick/);
  assert.match(
    entriesProblem([entry(), entry({ id: "b", kind: "pw_qty" })]) ?? "",
    /separate bills/,
  );
  assert.match(
    entriesProblem([entry(), entry({ id: "b", contractorId: "x" })]) ?? "",
    /one contractor/,
  );
  // Two projects of one company make one bill (0166); of two companies, or a company-less project, they don't.
  const mobilisation = entry({ id: "b", projectId: "mobilisation" });
  assert.equal(entriesProblem([entry(), mobilisation]), undefined);
  assert.match(
    entriesProblem([entry(), entry({ id: "b", projectId: "infra", companyId: "ed" })]) ?? "",
    /one company/,
  );
  assert.match(
    entriesProblem([entry(), entry({ id: "b", projectId: "baveli", companyId: null })]) ?? "",
    /one company/,
  );
  assert.match(entriesProblem([entry(), mobilisation], true) ?? "", /work order.*one project/);
  assert.equal(entriesProblem([entry(), entry({ id: "b" })], true), undefined);
  // Piece-work by quantity and lump sums are one kind for billing.
  assert.equal(
    entriesProblem([entry({ kind: "pw_qty" }), entry({ id: "b", kind: "pw_lump" })]),
    undefined,
  );
});

test("daily wages: heads × day rates, plus GST, to the paisa", () => {
  const heads = headsOf([entry(), entry({ id: "b", masons: 1, helpers: 0, others: 1 })]);
  assert.deepEqual(heads, { masons: 3, helpers: 3, others: 1 });
  const rates = { mason: 900, helper: 700, other: 650 };
  assert.equal(dailyWagesTotal(heads, rates, 0), 3 * 900 + 3 * 700 + 650);
  assert.equal(dailyWagesTotal(heads, rates, 18), Math.round(5450 * 1.18 * 100) / 100);
  assert.match(dayRatesProblem(heads, { ...rates, other: null }) ?? "", /every trade/);
  assert.equal(
    dayRatesProblem(
      { masons: 1, helpers: 0, others: 0 },
      { mason: 900, helper: null, other: null },
    ),
    undefined,
  );
});

test("piece-work: 2 cum at ₹4,000 is ₹8,000; a lump sum is its amount", () => {
  const measured = entry({ id: "m", kind: "pw_qty", quantity: 2 });
  const lump = entry({ id: "l", kind: "pw_lump" });
  assert.equal(pieceWorkTotal([measured], { m: 4000 }, 0), 8000);
  assert.equal(pieceWorkTotal([measured, lump], { m: 4000, l: 15000 }, 0), 23000);
  assert.deepEqual(pieceRatesPayload({ m: 4000 }, 18), { m: { rate: 4000, gst_pct: 18 } });
});

test("the work order's rate comes first, then the rate book's; a lump sum is typed", () => {
  const measured = entry({ kind: "pw_qty", quantity: 2 });
  const book = new Map([["fd15", 3800]]);
  assert.equal(
    suggestedPieceRate(measured, [{ work_item_id: "fd15", is_lump_sum: false, rate: 4000 }], book),
    4000,
  );
  assert.equal(suggestedPieceRate(measured, [], book), 3800);
  assert.equal(suggestedPieceRate(entry({ kind: "pw_qty", workItemId: "none" }), [], book), null);
  assert.equal(suggestedPieceRate(entry({ kind: "pw_lump" }), [], book), null);
});

test("an entry reads as one line", () => {
  const base = { masons: 0, helpers: 0, others: 0, quantity: null, uom: null, description: null };
  assert.equal(
    describeEntry({ ...base, kind: "nmr", masons: 2, helpers: 3 }),
    "2 masons, 3 helpers",
  );
  assert.equal(describeEntry({ ...base, kind: "pw_qty", quantity: 2, uom: "cum" }), "2 cum");
  assert.equal(
    describeEntry({ ...base, kind: "pw_lump", description: "Porch" }),
    "Lump sum: Porch",
  );
});
