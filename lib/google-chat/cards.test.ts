/**
 * Pins the bot's fixed sentences — one assertion per refusal, both
 * greeting shapes, and a check that none of them leaks an email address.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { greeting, identityRefusal, type RefusalKind } from "./cards";

test("no-email refusal", () => {
  assert.equal(
    identityRefusal("no-email"),
    "Google didn't tell me who you are, so I can't act for you. Ask an admin to check the Relay bot.",
  );
});

test("unknown refusal", () => {
  assert.equal(
    identityRefusal("unknown"),
    "I don't know you yet: there's no toolbox account for this email. Ask an admin in Settings.",
  );
});

test("inactive refusal", () => {
  assert.equal(
    identityRefusal("inactive"),
    "Your toolbox account is switched off, so I can't act for you. Ask an admin in Settings.",
  );
});

test("no-relay refusal", () => {
  assert.equal(
    identityRefusal("no-relay"),
    "You don't have the Relay tool yet. Ask an admin to grant it in Settings.",
  );
});

test("failed refusal", () => {
  assert.equal(
    identityRefusal("failed"),
    "I couldn't check who you are just now. Please try again in a moment.",
  );
});

test("greeting names the command when one was typed", () => {
  assert.equal(
    greeting("Siddharth", "/court"),
    "Hi Siddharth! I heard /court — it isn't wired up yet, but now I know who's asking.",
  );
});

test("greeting without a command says nothing is wired up yet", () => {
  assert.equal(
    greeting("Siddharth", null),
    "Hi Siddharth! Slash commands are on their way — nothing to run just yet.",
  );
});

test("no refusal and no greeting ever contains an email", () => {
  const kinds: RefusalKind[] = ["no-email", "unknown", "inactive", "no-relay", "failed"];
  for (const kind of kinds) {
    assert.ok(!identityRefusal(kind).includes("@"));
  }
  assert.ok(!greeting("Siddharth", "/court").includes("@"));
  assert.ok(!greeting("there", null).includes("@"));
});
