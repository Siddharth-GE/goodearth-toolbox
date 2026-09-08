/**
 * The signing and the two network calls behind the app's own voice: mint
 * an access token for the Chat app's service account, and PATCH one card
 * the app posted. The decisions live next door in outbound-rules.ts; what
 * is here is the cryptography and the wire.
 *
 * NO `server-only` IMPORT, deliberately. This file is the mirror of
 * verify.ts — node:crypto, no database, no session — and like verify.ts
 * it is safe outside a request. The `server-only` package throws the
 * moment it is imported under `tsx`, and two scripts need exactly these
 * three functions: scripts/google-chat-patch-card.ts proves by hand that
 * Google lets the app rewrite a private card it posted, which is the one
 * belief plan.md's step 2 exists to settle. The server-only boundary sits
 * one level up, on outbound.ts, which holds the token cache and reads the
 * environment.
 *
 * Nothing here ever throws and nothing here ever logs: the assertion, the
 * access token and Google's response body are all either a credential or
 * a message someone wrote, and a refresh that fails must cost a caller a
 * short string and nothing else.
 *
 * No JWT library. Google's service-account flow is one signed assertion
 * with three fixed claims, and node:crypto signs RS256 natively — the
 * same argument verify.ts makes for verifying them.
 */
import { sign } from "node:crypto";

import { TOKEN_URL, assertionClaims, patchUrl, type ServiceAccountKey } from "./outbound-rules";

/** base64url of a JSON value — the encoding every JWT segment is written in. */
function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * The signed assertion Google trades for an access token: the fixed
 * RS256 header, the claims from outbound-rules.ts, and an RSA signature
 * over the two of them joined by a dot.
 *
 * The private key needs no unescaping — it comes out of `JSON.parse` on
 * the downloaded key file, so its newlines are already real newlines.
 * (A key pasted into a shell as `\n` sequences would fail here, loudly,
 * which is the right way round.)
 */
export function signAssertion(key: ServiceAccountKey, nowSeconds: number): string {
  const header = encodeSegment({ alg: "RS256", typ: "JWT" });
  const payload = encodeSegment(assertionClaims(key.clientEmail, nowSeconds));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), key.privateKey);
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

/**
 * One hour of the app's own authority, in exchange for one assertion.
 *
 * The failure side is a short string, never an exception and never
 * Google's own words: `token:<http status>` when Google refused,
 * `token:network` when the call never landed, `token:timeout` when the
 * caller's deadline ran out first. Google's error body can carry the
 * assertion back at you, so it is read for nothing and logged nowhere.
 *
 * `expiresAt` is absolute seconds on the same clock `nowSeconds` came
 * from, so the caller's cache and this function never disagree about
 * what time it is.
 */
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

/**
 * Rewrite the cards of one message the app posted. `updateMask=cardsV2`
 * is on the URL (outbound-rules.ts), so the text, the sender and — the
 * part that matters — the message's `privateMessageViewer` are all left
 * exactly as they were: an update cannot change who may see a private
 * card, and this never tries to.
 *
 * The answer is a status and, when Google bothered to say why, its own
 * one-word reason (`PERMISSION_DENIED`, `NOT_FOUND`) so a failed refresh
 * in the log says something actionable. A call that never landed is
 * status 0 — no HTTP status exists to report — with "network" or
 * "timeout" as the reason. Nothing else from the body is read.
 */
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

/**
 * Google's own name for what went wrong, out of the standard error
 * envelope. A body that is not that shape — an HTML error page from a
 * proxy, say — is worth nothing to a log line, so it becomes null rather
 * than a paragraph of somebody else's markup.
 */
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

/**
 * Whether a rejected fetch was our own deadline. Node names it
 * "TimeoutError" when the signal came from `AbortSignal.timeout` and
 * "AbortError" when something aborted it directly; both mean the same
 * thing to a caller with five seconds to spend.
 */
function isAbort(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError";
}
