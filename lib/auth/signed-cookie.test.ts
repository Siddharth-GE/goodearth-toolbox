/**
 * The signed cookies are the sign-in flow's working memory: "password
 * proven", "code passed", "device remembered". These tests pin what the
 * signature must refuse — tampering, the wrong kind replayed as another,
 * a dead expiry, and a foreign secret.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { maskEmail, signPayload, verifyPayload, type SignedPayload } from "./signed-cookie";

const SECRET = "test-secret-long-enough-to-be-real";
const now = Date.now();

const challenge: SignedPayload = {
  kind: "challenge",
  subject: "anu@goodearth.test",
  exp: now + 10 * 60_000,
  sentAt: now,
};

test("a signed payload round-trips intact", () => {
  const token = signPayload(challenge, SECRET);
  const back = verifyPayload(token, "challenge", SECRET, now);
  assert.deepEqual(back, challenge);
});

test("one flipped character kills the signature", () => {
  const token = signPayload(challenge, SECRET);
  const bent = token.slice(0, 5) + (token[5] === "A" ? "B" : "A") + token.slice(6);
  assert.equal(verifyPayload(bent, "challenge", SECRET, now), null);
});

test("a payload edited after signing is refused", () => {
  const token = signPayload(challenge, SECRET);
  const [, sig] = token.split(".");
  const forged =
    Buffer.from(JSON.stringify({ ...challenge, subject: "attacker@evil.test" })).toString(
      "base64url",
    ) + `.${sig}`;
  assert.equal(verifyPayload(forged, "challenge", SECRET, now), null);
});

test("a cookie of one kind cannot be replayed as another", () => {
  // A challenge only proves the password; replaying it as "verified"
  // would skip the code entirely. The kind lives inside the signature.
  const token = signPayload(challenge, SECRET);
  assert.equal(verifyPayload(token, "verified", SECRET, now), null);
  assert.equal(verifyPayload(token, "trusted", SECRET, now), null);
});

test("an expired payload verifies as nothing", () => {
  const token = signPayload({ ...challenge, exp: now - 1 }, SECRET);
  assert.equal(verifyPayload(token, "challenge", SECRET, now), null);
});

test("a different secret verifies nothing", () => {
  const token = signPayload(challenge, SECRET);
  assert.equal(verifyPayload(token, "challenge", "some-other-secret", now), null);
});

test("junk is null, not a crash", () => {
  assert.equal(verifyPayload("", "challenge", SECRET, now), null);
  assert.equal(verifyPayload("no-dot-here", "challenge", SECRET, now), null);
  assert.equal(verifyPayload("a.b.c", "challenge", SECRET, now), null);
  assert.equal(verifyPayload("!!!.???", "challenge", SECRET, now), null);
});

test("the masked email keeps the domain and the first letter only", () => {
  assert.equal(maskEmail("anu@goodearth.test"), "a•••@goodearth.test");
  assert.equal(maskEmail("not-an-email"), "not-an-email");
});
