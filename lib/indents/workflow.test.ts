/**
 * The indent status rules, pinned. These same rules are enforced
 * DB-side by indents_guard (migration 0019); this covers the pure
 * mirror that drives buttons and friendly error messages.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { canDecide, canDelete, canEditIndent, canSubmit } from "./workflow";

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
