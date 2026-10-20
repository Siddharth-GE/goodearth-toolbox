// Signing and the token call behind acting as one of our Google service accounts. No
// `server-only`: scripts run this under tsx, where that import throws. Never throws and never
// logs: the assertion, token and Google's body are credentials. No JWT library: node:crypto signs RS256.
import { sign } from "node:crypto";

import { TOKEN_URL, assertionClaims, type ServiceAccountKey } from "./service-account-rules";

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// The private key needs no unescaping: it comes out of JSON.parse, so a pasted-in escaped one fails loudly.
export function signAssertion(key: ServiceAccountKey, scope: string, nowSeconds: number): string {
  const header = encodeSegment({ alg: "RS256", typ: "JWT" });
  const payload = encodeSegment(assertionClaims(key.clientEmail, scope, nowSeconds));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), key.privateKey);
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

// Failure is a short string, never Google's words: its error body can echo the assertion.
// `expiresAt` is on the same clock as `nowSeconds`.
export async function fetchAccessToken(
  key: ServiceAccountKey,
  scope: string,
  nowSeconds: number,
  signal?: AbortSignal,
): Promise<{ token: string; expiresAt: number } | { error: string }> {
  try {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signAssertion(key, scope, nowSeconds),
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal,
    });
    if (!response.ok) return { error: `token:${response.status}` };

    const json = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof json.access_token !== "string" || typeof json.expires_in !== "number") {
      return { error: "token:shape" };
    }
    return { token: json.access_token, expiresAt: nowSeconds + json.expires_in };
  } catch (error) {
    return { error: isAbort(error) ? "token:timeout" : "token:network" };
  }
}

// "TimeoutError" comes from AbortSignal.timeout, "AbortError" from a direct abort.
export function isAbort(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError";
}
