// Roles are additive and the higher approval ceiling wins; mirrors has_app() and bill_approval_cap() (0034).
import assert from "node:assert/strict";
import { test } from "node:test";

import { effectiveApprovalLimit, effectiveApps, effectiveGrant } from "./access-model";

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
