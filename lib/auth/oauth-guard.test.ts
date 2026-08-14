/**
 * The line between "colleague signing in with Google" and "stranger the
 * signup gate should have stopped". Deleting an account is the response,
 * so the edges here are the whole point.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isOauthSignupLeak } from "./oauth-guard";

const now = new Date("2026-08-14T10:00:00Z");
const minutesOld = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

test("a fresh google-only user is the leak", () => {
  assert.equal(
    isOauthSignupLeak({ createdAt: minutesOld(1), identityProviders: ["google"] }, now),
    true,
  );
});

test("an invited colleague linking Google minutes after the invite is safe", () => {
  // Invites create an email identity first, so google is never alone.
  assert.equal(
    isOauthSignupLeak({ createdAt: minutesOld(1), identityProviders: ["email", "google"] }, now),
    false,
  );
});

test("an ordinary password account is never the leak", () => {
  assert.equal(
    isOauthSignupLeak({ createdAt: minutesOld(0.1), identityProviders: ["email"] }, now),
    false,
  );
});

test("an old google-only account is left for a human, not deleted", () => {
  assert.equal(
    isOauthSignupLeak({ createdAt: minutesOld(11), identityProviders: ["google"] }, now),
    false,
  );
});

test("no identities or junk timestamps fail closed for the account", () => {
  assert.equal(isOauthSignupLeak({ createdAt: minutesOld(1), identityProviders: [] }, now), false);
  assert.equal(
    isOauthSignupLeak({ createdAt: "not-a-date", identityProviders: ["google"] }, now),
    false,
  );
});
