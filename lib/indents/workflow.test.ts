/**
 * The indent status rules, pinned. These same rules are enforced
 * DB-side by indents_guard (migration 0019); this covers the pure
 * mirror that drives buttons and friendly error messages.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  approvalBlocker,
  canDecide,
  canDelete,
  canEditIndent,
  canSubmit,
  estimatorHold,
  stillToBuy,
  waitsForEstimator,
} from "./workflow";

test("only a draft is editable", () => {
  assert.equal(canEditIndent("draft"), true);
  assert.equal(canEditIndent("submitted"), false);
  assert.equal(canEditIndent("approved"), false);
});

test("an empty indent cannot be submitted", () => {
  assert.equal(canSubmit("draft", 0), false);
  assert.equal(canSubmit("draft", 1), true);
  // Already past draft: never submittable again, whatever the count.
  assert.equal(canSubmit("submitted", 5), false);
  assert.equal(canSubmit("approved", 5), false);
});

test("only a named approver or an admin decides, and only when submitted", () => {
  const approver = { isAdmin: false, isApprover: true };
  const admin = { isAdmin: true, isApprover: false };
  const neither = { isAdmin: false, isApprover: false };

  assert.equal(canDecide("submitted", approver), true);
  assert.equal(canDecide("submitted", admin), true);
  assert.equal(canDecide("submitted", neither), false);

  // A draft has nothing to decide; an approved indent is settled.
  assert.equal(canDecide("draft", admin), false);
  assert.equal(canDecide("approved", admin), false);
});

test("only a draft can be deleted", () => {
  assert.equal(canDelete("draft"), true);
  assert.equal(canDelete("submitted"), false);
  assert.equal(canDelete("approved"), false);
});

test("still to buy is requested less ordered, never below zero", () => {
  assert.equal(stillToBuy(45, 0), 45);
  assert.equal(stillToBuy(45, 30), 15);
  assert.equal(stillToBuy(45, 45), 0);
  assert.equal(stillToBuy(45, 50), 0, "over-ordered reads as nothing left, not a negative");
  assert.equal(stillToBuy(0.3, 0.1), 0.2, "no floating-point dust");
});

test("only a line outside every estimate and budget waits for the estimator", () => {
  assert.equal(waitsForEstimator("direct"), true);
  assert.equal(waitsForEstimator("estimate"), false);
  assert.equal(waitsForEstimator("interiors"), false);
  assert.equal(waitsForEstimator("construction"), false, "retired history never waits");
});

test("the hold counts reasons, waiting and refused lines — outside lines only", () => {
  const line = (source: string, reason: string | null, decision: string | null) => ({
    source,
    off_estimate_reason: reason,
    estimator_decision: decision,
  });
  const hold = estimatorHold([
    line("direct", null, null),
    line("direct", "   ", null),
    line("direct", "For the sump", "approved"),
    line("direct", "For the sump", "refused"),
    line("estimate", null, null),
    line("interiors", null, null),
  ]);
  assert.deepEqual(hold, { needReason: 2, waiting: 2, refused: 1 });
});

test("a refusal outranks waiting, and nothing held means no blocker", () => {
  assert.equal(approvalBlocker({ needReason: 0, waiting: 0, refused: 0 }), null);
  assert.match(
    approvalBlocker({ needReason: 0, waiting: 2, refused: 0 }) ?? "",
    /Waiting for the estimator on 2 lines/,
  );
  assert.match(approvalBlocker({ needReason: 0, waiting: 1, refused: 1 }) ?? "", /refused 1 line/);
});
