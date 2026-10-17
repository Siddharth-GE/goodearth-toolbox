import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * The kiosk's PIN primitives, split out so node:test can load them (node:crypto only). scrypt, not a bare SHA:
 * only 10,000 PINs exist, so slow hashing is what makes guessing a leaked row costly; timingSafeEqual hides closeness.
 */

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPinHash(pin: string, hash: string, salt: string) {
  const candidate = scryptSync(pin, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/** Lockout wording in plain language, rounded up so "1 minute" never means "any second now". */
export function lockoutMessage({ lockedUntil }: { lockedUntil: Date }) {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  return `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
