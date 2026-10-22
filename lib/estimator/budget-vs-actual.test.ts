import assert from "node:assert/strict";
import { test } from "node:test";

import { addAmounts, budgetReport, type CostFact } from "./budget-vs-actual";

const works = new Map([
  ["fd2", { label: "FD.02.04 — Excavation", categoryId: "fd", sortOrder: 2 }],
  ["fd1", { label: "FD.01.01 — Setting out", categoryId: "fd", sortOrder: 1 }],
  ["ss1", { label: "SS.01.00 — Superstructure package", categoryId: "ss", sortOrder: 1 }],
]);
const stages = new Map([
  ["ss", { label: "Superstructure", sortOrder: 2 }],
  ["fd", { label: "Foundation", sortOrder: 1 }],
]);
const fact = (
  workItemId: string | null,
  kind: string,
  amount: number,
  unpriced = false,
): CostFact => ({
  workItemId,
  kind,
  amount,
  unpriced,
});

test("estimated, committed and actual per work, stages in order, a total", () => {
  const report = budgetReport(
    [
      fact("fd2", "estimated_labour", 40000),
      fact("fd2", "estimated_material", 60000),
      fact("fd2", "po_committed", 55000),
      fact("fd2", "wo_committed", 38000),
      fact("fd2", "material_issued", 30000),
      fact("fd2", "material_delivered", 5000),
      fact("fd2", "labour_billed", 20000),
      // Material billed is accounts' side of a PO already counted as committed; never actual.
      fact("fd2", "material_billed", 50000),
      fact("fd1", "estimated_labour", 8000),
      fact("ss1", "estimated_labour", 900000),
    ],
    works,
    stages,
  );
  assert.deepEqual(
    report.stages.map((stage) => [stage.label, stage.works.map((work) => work.label)]),
    [
      ["Foundation", ["FD.01.01 — Setting out", "FD.02.04 — Excavation"]],
      ["Superstructure", ["SS.01.00 — Superstructure package"]],
    ],
  );
  const excavation = report.stages[0].works[1];
  assert.deepEqual(excavation.estimated, { amount: 100000, partial: false });
  assert.deepEqual(excavation.committed, { amount: 93000, partial: false });
  assert.deepEqual(excavation.actual, { amount: 55000, partial: false });
  assert.deepEqual(excavation.left, { amount: 45000, partial: false });

  const setting = report.stages[0].works[0];
  assert.equal(setting.committed, null);
  assert.equal(setting.actual, null);
  assert.deepEqual(setting.left, { amount: 8000, partial: false });

  assert.deepEqual(report.stages[0].estimated, { amount: 108000, partial: false });
  assert.deepEqual(report.total.estimated, { amount: 1008000, partial: false });
  assert.deepEqual(report.total.actual, { amount: 55000, partial: false });
});

test("an unpriced part makes every sum it reaches partial — never a smaller whole", () => {
  const report = budgetReport(
    [fact("fd2", "estimated_material", 60000), fact("fd2", "material_issued", 12000, true)],
    works,
    stages,
  );
  const work = report.stages[0].works[0];
  assert.deepEqual(work.actual, { amount: 12000, partial: true });
  assert.deepEqual(work.left, { amount: 48000, partial: true });
  assert.equal(report.total.actual?.partial, true);
});

test("spending on no work, or a work gone from Masters, still shows", () => {
  const report = budgetReport(
    [fact(null, "labour_billed", 7000), fact("gone", "labour_billed", 3000)],
    works,
    stages,
  );
  assert.deepEqual(
    report.stages.map((stage) => [stage.label, stage.works[0].label]),
    [
      ["No work recorded", "No work recorded"],
      ["Other", "A work no longer in Masters"],
    ],
  );
  assert.deepEqual(report.total.actual, { amount: 10000, partial: false });
  assert.deepEqual(report.total.left, { amount: -10000, partial: false });
});

test("adding nothing is nothing, not zero", () => {
  assert.equal(addAmounts(null, null), null);
  assert.deepEqual(addAmounts(null, { amount: 5, partial: true }), { amount: 5, partial: true });
});
