import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed cookie payloads, `base64url(json).base64url(hmac)`: the browser holds the
 * statement but cannot write it, `exp` kills a copied cookie, and the comparison is
 * timing-safe. Pure, so it is tested.
 */

export type SignedPayload = {
  /** The flow step, inside the signature, so a verified cookie can't replay as a challenge. */
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
