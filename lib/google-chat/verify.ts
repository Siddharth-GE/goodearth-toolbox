// The door's lock: proof the request came from Google Chat, checked first. New Chat apps are
// Workspace add-ons signing a Google ID token (issuer accounts.google.com, audience = the endpoint
// URL). Issuer and audience alone are a hole: ANY Google service account can mint such a token
// for our URL. The email claim, which must be our project's own Chat service agent, ties it to
// us. All three are checked, always. No JWT library: one algorithm against a pinned issuer is
// where a general verifier adds surface, not safety. verifyChatToken is pure; only getGoogleKeys
// and the env accessors touch the network or environment.
import {
  X509Certificate,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

export const CHAT_ISSUER = "https://accounts.google.com";

// Google's OIDC signing certs, kid → x509 PEM.
const CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs";

export type ChatTokenClaims = {
  iss: string;
  aud: string;
  exp: number;
  email: string;
  [claim: string]: unknown;
};

// Never throws: a malformed token is a stranger at the door.
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

  // Algorithm pinned; "none" and anything else is refused before the key is looked up.
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

export function keyFromPem(pem: string): KeyObject {
  if (pem.includes("BEGIN CERTIFICATE")) {
    return new X509Certificate(pem).publicKey;
  }
  return createPublicKey(pem);
}

let cachedKeys: { keys: Map<string, KeyObject>; freshUntil: number } | null = null;

// Cached per Cache-Control, and served stale if a refresh fails, so a Google hiccup during key
// rotation can't take the bot down.
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

// Names the project's Chat service agent, which every token must carry as its email. Differs per
// Chat app, so each environment verifies only its own traffic. Throws when unset rather than
// quietly verifying nothing.
export function projectNumber(): string {
  const value = process.env.GOOGLE_CHAT_PROJECT_NUMBER;
  if (!value) throw new Error("GOOGLE_CHAT_PROJECT_NUMBER is not set");
  return value;
}

export function chatServiceAgent(): string {
  return `service-${projectNumber()}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`;
}

// The endpoint URL exactly as registered in the Chat app; differs per environment.
export function chatAudience(): string {
  const value = process.env.GOOGLE_CHAT_AUDIENCE;
  if (!value) throw new Error("GOOGLE_CHAT_AUDIENCE is not set");
  return value;
}

// Derived from the registered endpoint URL, not a site-URL setting, so a card built on staging
// can only link to staging (BUGCATCHER #7).
export function chatOrigin(): string {
  return new URL(chatAudience()).origin;
}
