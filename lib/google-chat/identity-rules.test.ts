/**
 * The six answers the door is allowed to give about who typed, pinned
 * one by one. This is the only honest way to prove the refusal paths:
 * nobody deactivates a real colleague to watch the bot say so.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decideIdentity, type IdentityProfile } from "./identity-rules";

const AUTH_USER = { id: "user-1" };

function profile(overrides: Partial<IdentityProfile> = {}): IdentityProfile {
  return {
    id: "user-1",
    full_name: "Siddharth Cyriac",
    role: "staff",
    is_active: true,
    apps: ["/relay"],
    ...overrides,
  };
}

test("a live account holding /relay is ok, named by its first word", () => {
  const identity = decideIdentity("sid@goodearth.test", AUTH_USER, profile());
  assert.equal(identity.kind, "ok");
  if (identity.kind !== "ok") return;
  assert.equal(identity.userId, "user-1");
  assert.equal(identity.fullName, "Siddharth Cyriac");
  assert.equal(identity.firstName, "Siddharth");
  assert.equal(identity.isAdmin, false);
  assert.deepEqual(identity.grantedApps, ["/relay"]);
});

test("no email at all is no-email, before anything is looked up", () => {
  assert.equal(decideIdentity(null, null, null).kind, "no-email");
  assert.equal(decideIdentity(null, AUTH_USER, profile()).kind, "no-email");
});

test("an email with no toolbox account is unknown", () => {
  assert.equal(decideIdentity("stranger@example.test", null, null).kind, "unknown");
});

test("an auth user with no profile row is unknown too", () => {
  assert.equal(decideIdentity("sid@goodearth.test", AUTH_USER, null).kind, "unknown");
});

test("a deactivated account is inactive", () => {
  assert.equal(
    decideIdentity("sid@goodearth.test", AUTH_USER, profile({ is_active: false })).kind,
    "inactive",
  );
});

test("being switched off is said before being ungranted", () => {
  assert.equal(
    decideIdentity("sid@goodearth.test", AUTH_USER, profile({ is_active: false, apps: [] })).kind,
    "inactive",
  );
});

test("a live account without the Relay grant is no-relay", () => {
  assert.equal(
    decideIdentity("sid@goodearth.test", AUTH_USER, profile({ apps: ["/indents"] })).kind,
    "no-relay",
  );
});

test("an admin holds Relay without an explicit grant", () => {
  const identity = decideIdentity(
    "sid@goodearth.test",
    AUTH_USER,
    profile({ role: "admin", apps: [] }),
  );
  assert.equal(identity.kind, "ok");
  if (identity.kind !== "ok") return;
  assert.equal(identity.isAdmin, true);
});

test("a grant through a role bundle counts, same as a personal one", () => {
  // resolveIdentity merges the two sources before deciding, so a role
  // bundle arrives here indistinguishable from a personal grant — this
  // pins that the merged list is what the decision reads.
  const identity = decideIdentity(
    "sid@goodearth.test",
    AUTH_USER,
    profile({ apps: ["/indents", "/relay"] }),
  );
  assert.equal(identity.kind, "ok");
});

test("a profile belonging to a different id is failed, not ok", () => {
  assert.equal(
    decideIdentity("sid@goodearth.test", AUTH_USER, profile({ id: "somebody-else" })).kind,
    "failed",
  );
});

test("a blank name still greets somebody", () => {
  const blank = decideIdentity("sid@goodearth.test", AUTH_USER, profile({ full_name: "   " }));
  assert.equal(blank.kind === "ok" && blank.firstName, "there");

  const missing = decideIdentity("sid@goodearth.test", AUTH_USER, profile({ full_name: null }));
  assert.equal(missing.kind === "ok" && missing.firstName, "there");
  assert.equal(missing.kind === "ok" && missing.fullName, null);
});
