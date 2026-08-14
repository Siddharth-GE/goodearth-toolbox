import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-signed cookie payloads for the sign-in flow — the same shape as
 * the Marathon kiosk session (lib/marathon/session.ts), extracted pure
 * so it can be tested without Next's cookie machinery. This file may
 * import node:crypto and nothing else.
 *
 * A signed payload is `base64url(json).base64url(hmac)`. The signature
 * means the browser can hold the statement without being able to write
 * it; the `exp` inside means a copied cookie dies on schedule. The
 * comparison is timingSafeEqual so verification time never leaks how
 * close a forgery was.
 */

export type SignedPayload = {
  /** What this cookie asserts: which flow step it belongs to. A verified
   * cookie can never be replayed as a challenge cookie — the kind is
   * inside the signature. */
  kind: "challenge" | "verified" | "trusted";
  /** The subject: an email for a challenge, a user id afterwards. */
  subject: string;
  /** Unix ms. Dead payloads verify as null. */
  exp: number;
  /** When the last code was sent (challenge only) — the resend cooldown. */
  sentAt?: number;
};

export function signPayload(payload: SignedPayload, secret: string) {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyPayload(
  token: string,
  kind: SignedPayload["kind"],
  secret: string,
  now: number = Date.now(),
): SignedPayload | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  const expected = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as SignedPayload;
    if (payload.kind !== kind) return null;
    if (typeof payload.subject !== "string" || !payload.subject) return null;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** m•••@gmail.com — enough for "yes, that inbox", nothing for a shoulder. */
export function maskEmail(email: string) {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return `${email[0]}•••${email.slice(at)}`;
}
