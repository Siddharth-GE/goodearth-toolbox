// Signing and the two network calls behind the app's own voice. No `server-only`: scripts run
// this under tsx, where that import throws. Never throws and never logs: the assertion, token
// and Google's body are credentials or somebody's words. No JWT library: node:crypto signs RS256.
import { sign } from "node:crypto";

import { TOKEN_URL, assertionClaims, patchUrl, type ServiceAccountKey } from "./outbound-rules";

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// The private key needs no unescaping: it comes out of JSON.parse, so a pasted-in escaped one fails loudly.
export function signAssertion(key: ServiceAccountKey, nowSeconds: number): string {
  const header = encodeSegment({ alg: "RS256", typ: "JWT" });
  const payload = encodeSegment(assertionClaims(key.clientEmail, nowSeconds));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), key.privateKey);
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

// Failure is a short string, never Google's words: its error body can echo the assertion.
// `expiresAt` is on the same clock as `nowSeconds`.
export async function fetchAppToken(
  key: ServiceAccountKey,
  nowSeconds: number,
  signal?: AbortSignal,
): Promise<{ token: string; expiresAt: number } | { error: string }> {
  try {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signAssertion(key, nowSeconds),
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

// updateMask=cardsV2 leaves the text, sender and privateMessageViewer alone: an update can't
// change who sees a private card. Status 0 means the call never landed.
export async function patchCard(
  token: string,
  messageName: string,
  cardsV2: unknown[],
  signal?: AbortSignal,
): Promise<{ status: number; reason: string | null }> {
  try {
    const response = await fetch(patchUrl(messageName), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cardsV2 }),
      cache: "no-store",
      signal,
    });
    if (response.ok) return { status: response.status, reason: null };
    return { status: response.status, reason: await failureReason(response) };
  } catch (error) {
    return { status: 0, reason: isAbort(error) ? "timeout" : "network" };
  }
}

// A body that isn't Google's error shape (a proxy's HTML page) becomes null.
async function failureReason(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { status?: unknown; message?: unknown } };
    const status = body.error?.status;
    if (typeof status === "string" && status) return status;
    const message = body.error?.message;
    if (typeof message === "string" && message) return message;
    return null;
  } catch {
    return null;
  }
}

// "TimeoutError" comes from AbortSignal.timeout, "AbortError" from a direct abort.
function isAbort(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError";
}
