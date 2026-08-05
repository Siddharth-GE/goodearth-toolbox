/**
 * Roles are additive: a bundle can only ever add to what someone holds
 * personally, and the approval ceiling that applies is the more
 * generous of the two. These rules are mirrored by has_app() and
 * bill_approval_cap() in migration 0034 — a disagreement here is a
 * screen that lies about what the database will allow.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canApproveEffective,
  effectiveApprovalLimit,
  effectiveApps,
  effectiveGrant,
} from "./access-model";

const personal = new Set(["/masters", "/indents"]);
const role = new Set(["/bills", "/indents"]);

test("a grant is labelled by where it came from", () => {
  assert.deepEqual(effectiveGrant("/masters", personal, role), {
    granted: true,
    source: "personal",
  });
  assert.deepEqual(effectiveGrant("/bills", personal, role), { granted: true, source: "role" });
  assert.deepEqual(effectiveGrant("/indents", personal, role), { granted: true, source: "both" });
});

test("an app in neither is not granted, and has no source to explain", () => {
  assert.deepEqual(effectiveGrant("/budgets", personal, role), { granted: false, source: null });
});

test("the union holds every app once, from either side", () => {
  assert.deepEqual(effectiveApps(personal, role), ["/bills", "/indents", "/masters"]);
});

test("no role means personal grants stand exactly as they are", () => {
  assert.deepEqual(effectiveApps(personal, new Set()), ["/indents", "/masters"]);
  assert.deepEqual(effectiveGrant("/masters", personal, new Set()), {
    granted: true,
    source: "personal",
  });
});

test("either source alone confers the right to approve", () => {
  assert.equal(canApproveEffective({ personal: true, fromRole: false }), true);
  assert.equal(canApproveEffective({ personal: false, fromRole: true }), true);
  assert.equal(canApproveEffective({ personal: false, fromRole: false }), false);
});

test("unlimited from either side wins — combining rights never shrinks them", () => {
  assert.equal(
    effectiveApprovalLimit({ isApprover: true, limit: null }, { canApprove: true, limit: 50000 }),
    null,
  );
  assert.equal(
    effectiveApprovalLimit({ isApprover: true, limit: 50000 }, { canApprove: true, limit: null }),
    null,
  );
});

test("two numbers resolve to the larger", () => {
  assert.equal(
    effectiveApprovalLimit({ isApprover: true, limit: 50000 }, { canApprove: true, limit: 200000 }),
    200000,
  );
  assert.equal(
    effectiveApprovalLimit({ isApprover: true, limit: 200000 }, { canApprove: true, limit: 50000 }),
    200000,
  );
});

test("a source that grants no right contributes no ceiling", () => {
  // The role doesn't approve bills at all — its stored limit is noise.
  assert.equal(
    effectiveApprovalLimit({ isApprover: true, limit: 50000 }, { canApprove: false, limit: null }),
    50000,
  );
  // Not named personally; the role's limit is the one that applies.
  assert.equal(
    effectiveApprovalLimit({ isApprover: false, limit: null }, { canApprove: true, limit: 75000 }),
    75000,
  );
});

test("someone with no approval right anywhere has no limit to report", () => {
  assert.equal(
    effectiveApprovalLimit({ isApprover: false, limit: null }, { canApprove: false, limit: 999 }),
    null,
  );
});
