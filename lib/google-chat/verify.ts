/**
 * The door's lock: proof that a request to /api/google-chat really came
 * from Google Chat, checked before anything else runs.
 *
 * Reality, learned from Google's own tokens on 2026-09-01: new Chat apps
 * are registered as Workspace add-ons, and those sign events with a
 * Google ID token — issuer https://accounts.google.com, audience = the
 * exact endpoint URL — not the classic chat@system.gserviceaccount.com /
 * project-number pair the docs still describe. Issuer + audience alone
 * would be a hole, not a lock: ANY Google service account can mint an
 * accounts.google.com ID token naming our URL as audience. What ties the
 * token to OUR Cloud project is its email claim, which must be the
 * project's own Chat service agent
 * (service-<projectNumber>@gcp-sa-gsuiteaddons.iam.gserviceaccount.com).
 * All three are checked, always.
 *
 * Verification is split so the cryptography is pure and testable:
 * verifyChatToken takes the keys, the expected audience, the expected
 * service agent and the clock as arguments; only getGoogleKeys and the
 * env accessors touch the network and the environment.
 *
 * No JWT library — node:crypto does RS256 natively, and one algorithm
 * against a pinned issuer is exactly the case where a general-purpose
 * verifier adds surface, not safety.
 */
import {
  X509Certificate,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

export const CHAT_ISSUER = "https://accounts.google.com";

// Google's OIDC signing certs, kid → x509 PEM — same shape as the old
// per-service-account certs URL, so keyFromPem covers both.
const CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs";

export type ChatTokenClaims = {
  iss: string;
  aud: string;
  exp: number;
  email: string;
  [claim: string]: unknown;
};

/**
 * Verify a Google Chat bearer token. Returns the claims when everything
 * holds — RS256 signature by a known key, the accounts.google.com
 * issuer, our exact endpoint URL as audience, the project's own Chat
 * service agent as verified email, not expired — and null for anything
 * else. Never throws: a malformed token is a stranger at the door, not
 * an exception.
 */
export function verifyChatToken(
  token: string,
  keys: Map<string, KeyObject>,
  audience: string,
  serviceAgent: string,
  nowSeconds: number,
): ChatTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof header !== "object" || header === null) return null;
  if (typeof payload !== "object" || payload === null) return null;

  // Algorithm pinned to what Google actually uses. Anything else —
  // including "none" — is refused before the key is even looked up.
  const { alg, kid } = header as { alg?: unknown; kid?: unknown };
  if (alg !== "RS256" || typeof kid !== "string") return null;

  const key = keys.get(kid);
  if (!key) return null;

  let signatureHolds = false;
  try {
    signatureHolds = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${headerB64}.${payloadB64}`),
      key,
      Buffer.from(signatureB64, "base64url"),
    );
  } catch {
    return null;
  }
  if (!signatureHolds) return null;

  const claims = payload as ChatTokenClaims;
  if (claims.iss !== CHAT_ISSUER) return null;
  if (claims.aud !== audience) return null;
  // The claim that makes this OUR lock and not just "a Google lock":
  // without it, any Google service account could mint a passing token.
  if (claims.email !== serviceAgent) return null;
  if (claims.email_verified !== true) return null;
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null;

  return claims;
}

/**
 * A PEM — either an x509 certificate (what Google publishes) or a bare
 * public key (what the tests mint) — as a verification key.
 */
export function keyFromPem(pem: string): KeyObject {
  if (pem.includes("BEGIN CERTIFICATE")) {
    return new X509Certificate(pem).publicKey;
  }
  return createPublicKey(pem);
}

let cachedKeys: { keys: Map<string, KeyObject>; freshUntil: number } | null = null;

/**
 * Google's current signing certificates, kid → key. Cached in module
 * scope for as long as the response's Cache-Control allows, and served
 * stale if a refresh fails — a hiccup at Google during a key rotation
 * must not take the bot down with it.
 */
export async function getGoogleKeys(): Promise<Map<string, KeyObject>> {
  const now = Date.now();
  if (cachedKeys && cachedKeys.freshUntil > now) return cachedKeys.keys;

  try {
    const response = await fetch(CERTS_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google certs endpoint answered ${response.status}`);
    const body = (await response.json()) as Record<string, string>;

    const keys = new Map(Object.entries(body).map(([kid, pem]) => [kid, keyFromPem(pem)]));
    if (keys.size === 0) throw new Error("Google certs endpoint returned no keys");

    const maxAge = /max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1];
    cachedKeys = { keys, freshUntil: now + Number(maxAge ?? 3600) * 1000 };
    return keys;
  } catch (error) {
    if (cachedKeys) return cachedKeys.keys;
    throw error;
  }
}

/**
 * The Cloud project number — it names the project's Chat service agent,
 * which every accepted token must carry as its email claim. Different
 * per Chat app, so staging and production each verify only their own
 * traffic. Throws by name when unset rather than quietly verifying
 * nothing (the MARATHON_SESSION_SECRET idiom).
 */
export function projectNumber(): string {
  const value = process.env.GOOGLE_CHAT_PROJECT_NUMBER;
  if (!value) throw new Error("GOOGLE_CHAT_PROJECT_NUMBER is not set");
  return value;
}

/** The one Google identity allowed through: this project's Chat service agent. */
export function chatServiceAgent(): string {
  return `service-${projectNumber()}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`;
}

/**
 * The audience Google stamps into the token: the endpoint URL exactly as
 * registered in the Chat app's connection settings — so it differs per
 * environment and must match character for character.
 */
export function chatAudience(): string {
  const value = process.env.GOOGLE_CHAT_AUDIENCE;
  if (!value) throw new Error("GOOGLE_CHAT_AUDIENCE is not set");
  return value;
}
