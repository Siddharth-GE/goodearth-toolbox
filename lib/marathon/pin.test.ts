/**
 * The kiosk's only auth primitive, on a public URL — worth pinning.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPin, lockoutMessage, verifyPinHash } from "./pin";

test("a PIN verifies against its own hash and no other", () => {
  const { hash, salt } = hashPin("1234");
  assert.equal(verifyPinHash("1234", hash, salt), true);
  assert.equal(verifyPinHash("1235", hash, salt), false);
  assert.equal(verifyPinHash("", hash, salt), false);
});

test("the same PIN hashes differently each time (per-agent salt)", () => {
  // Two agents choosing the same PIN must not produce equal rows — a
  // leaked table should not give away that they match.
  const first = hashPin("1234");
  const second = hashPin("1234");
  assert.notEqual(first.hash, second.hash);
  assert.notEqual(first.salt, second.salt);
});

test("a corrupted stored hash fails closed", () => {
  const { salt } = hashPin("1234");
  assert.equal(verifyPinHash("1234", "not-hex-and-wrong-length", salt), false);
});

test("lockout message rounds up and never says zero minutes", () => {
  // Math.max(1, …) is the guard being pinned: "try again in 0 minutes"
  // would invite an immediate (still locked-out) retry.
  const soon = new Date(Date.now() + 5_000);
  assert.equal(
    lockoutMessage({ lockedUntil: soon }),
    "Too many wrong PINs. Try again in 1 minute.",
  );

  const later = new Date(Date.now() + 9.5 * 60_000);
  assert.equal(
    lockoutMessage({ lockedUntil: later }),
    "Too many wrong PINs. Try again in 10 minutes.",
  );
});
