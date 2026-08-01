import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * The kiosk's PIN primitives — hashing, verification, and the lockout
 * wording. Extracted from session.ts/rate-limit.ts so they can be tested
 * directly: those modules import the service-role client and Next
 * redirect machinery, which a plain node:test process can't load. This
 * file may import node:crypto and nothing else.
 *
 * scrypt (not a bare SHA) because agents choose 4-digit PINs: the whole
 * keyspace is 10,000 values, so the hash being slow to compute is the
 * only thing that makes an offline guess of a leaked row expensive.
 * timingSafeEqual so verification time doesn't leak how close a guess
 * was.
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

/**
 * Wording for a locked-out agent, in the plain language the rest of the
 * kiosk uses. Rounded up, so "1 minute" never means "any second now".
 */
export function lockoutMessage({ lockedUntil }: { lockedUntil: Date }) {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  return `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
