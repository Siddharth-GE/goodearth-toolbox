/**
 * The vocabularies, and the two functions that do more than list values.
 * The database CHECKs in 0050 are the real boundary; these pin the mirror.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BOTTLENECKS,
  INVOICE_STAGES,
  MILESTONE_STAGES,
  invoiceStageOf,
  milestoneLabel,
  normaliseBottlenecks,
  optionFor,
  DEED_STATUSES,
} from "./stages";

test("the nine seeded milestone stages match what create_client_engagement inserts", () => {
  assert.deepEqual(
    MILESTONE_STAGES.map((s) => s.value),
    [
      "plot",
      "booking",
      "foundation",
      "ground_floor_slab",
      "first_floor_slab",
      "internal_plastering",
      "floor_laying",
      "painting_polishing",
      "completed",
    ],
  );
  // The sort orders are the ones written into the migration, ten apart so
  // a stage can be inserted between two without renumbering.
  assert.deepEqual(
    MILESTONE_STAGES.map((s) => s.sortOrder),
    [10, 20, 30, 40, 50, 60, 70, 80, 90],
  );
});

test("the plot amount is not one of the invoice stages", () => {
  assert.equal(INVOICE_STAGES.length, 8);
  assert.equal(
    INVOICE_STAGES.some((s) => s.value === "plot"),
    false,
  );
});

test("invoice stage is the furthest rung invoiced, not the latest one entered", () => {
  const stage = invoiceStageOf([
    { stage: "foundation", invoicedOn: "2026-03-01" },
    { stage: "booking", invoicedOn: "2026-07-01" },
  ]);
  assert.equal(stage, "foundation", "further along the ladder wins, not the later date");
});

test("invoice stage is null when nothing has been invoiced", () => {
  assert.equal(invoiceStageOf([]), null);
  assert.equal(invoiceStageOf([{ stage: "booking", invoicedOn: null }]), null);
});

test("an invoiced plot amount does not become the invoice stage", () => {
  assert.equal(invoiceStageOf([{ stage: "plot", invoicedOn: "2026-01-01" }]), null);
});

test("bottlenecks are deduped, sorted, and stripped of anything unknown", () => {
  assert.deepEqual(normaliseBottlenecks(["payments", "design", "payments"]), [
    "design",
    "payments",
  ]);
  assert.deepEqual(normaliseBottlenecks(["nonsense", "client"]), ["client"]);
  assert.deepEqual(normaliseBottlenecks([]), []);
});

test("bottleneck order is the declared order, not the order ticked", () => {
  const clicked = normaliseBottlenecks(["interiors", "management", "design"]);
  const declared = BOTTLENECKS.map((b) => b.value).filter((v) => clicked.includes(v));
  assert.deepEqual(clicked, declared);
});

test("every bottleneck value survives normalising — the list and the CHECK agree", () => {
  const all = BOTTLENECKS.map((b) => b.value);
  assert.deepEqual(normaliseBottlenecks(all), all);
});

test("milestoneLabel falls back to the raw value rather than throwing", () => {
  assert.equal(milestoneLabel("first_floor_slab"), "First floor slab");
  assert.equal(milestoneLabel("something_new"), "something_new");
});

test("optionFor returns null for blank and unknown values", () => {
  assert.equal(optionFor(DEED_STATUSES, null)?.label, undefined);
  assert.equal(optionFor(DEED_STATUSES, "")?.label, undefined);
  assert.equal(optionFor(DEED_STATUSES, "made_up"), null);
  assert.equal(optionFor(DEED_STATUSES, "signed")?.label, "Signed");
});
