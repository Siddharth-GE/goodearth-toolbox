/**
 * Inviting creates a real login, and deactivating can lock the company
 * out of Settings for good — so both rules are pinned here: what a valid
 * invite looks like, and the two changes that must always be refused
 * (acting on yourself, and removing the last active admin).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { blockedReason, validateInvite } from "./invite";

const good = { fullName: "Anu Mary", email: "anu@goodearth.test", password: "firstpass1" };

test("a complete invite passes", () => {
  assert.equal(validateInvite(good), undefined);
});

test("name and email are required, and whitespace is not a name", () => {
  assert.match(validateInvite({ ...good, fullName: "   " })!, /name/i);
  assert.match(validateInvite({ ...good, email: "" })!, /email/i);
});

test("an address without an @ or a dot is caught before the round trip", () => {
  assert.match(validateInvite({ ...good, email: "anu-at-goodearth" })!, /email address/i);
  assert.match(validateInvite({ ...good, email: "anu@goodearth" })!, /email address/i);
  assert.equal(validateInvite({ ...good, email: "a.b@c.co.in" }), undefined);
});

test("a short starting password is refused, with the length in the message", () => {
  const error = validateInvite({ ...good, password: "short" });
  assert.match(error!, /8 characters/);
  assert.equal(validateInvite({ ...good, password: "12345678" }), undefined);
});

test("nobody may change their own admin status or switch themselves off", () => {
  const reason = blockedReason({
    targetIsAdmin: true,
    targetIsActive: true,
    activeAdminCount: 5,
    isSelf: true,
  });
  assert.match(reason!, /your own/i);
});

test("the last active admin cannot be demoted or deactivated", () => {
  const reason = blockedReason({
    targetIsAdmin: true,
    targetIsActive: true,
    activeAdminCount: 1,
    isSelf: false,
  });
  assert.match(reason!, /last active admin/i);
});

test("with a second admin in place the change is allowed", () => {
  assert.equal(
    blockedReason({
      targetIsAdmin: true,
      targetIsActive: true,
      activeAdminCount: 2,
      isSelf: false,
    }),
    undefined,
  );
});

test("a non-admin is never blocked by the last-admin rule", () => {
  assert.equal(
    blockedReason({
      targetIsAdmin: false,
      targetIsActive: true,
      activeAdminCount: 1,
      isSelf: false,
    }),
    undefined,
  );
});

test("an already-deactivated admin doesn't count as the last one standing", () => {
  assert.equal(
    blockedReason({
      targetIsAdmin: true,
      targetIsActive: false,
      activeAdminCount: 1,
      isSelf: false,
    }),
    undefined,
  );
});
