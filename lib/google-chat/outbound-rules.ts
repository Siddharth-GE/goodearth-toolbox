/**
 * The pure half of the app's own voice — how the door authenticates AS
 * the Chat app (a service account in the Chat app's own Cloud project,
 * scope chat.bot) to rewrite a card it posted, after a button press. The
 * signing and the network live in outbound.ts, which `tsx --test`
 * cannot import — the identity-rules.ts precedent: every branch that
 * decides something is pinned here, tested, with nothing in this file
 * that can touch a database, a network or an environment variable.
 *
 * This file may import nothing.
 */

export type ServiceAccountKey = { clientEmail: string; privateKey: string };

/**
 * Reads the service account's JSON key out of the env var that holds
 * the downloaded key file's contents, pasted as one line. Never throws:
 * unparseable JSON, or JSON missing either field in a usable shape, is
 * null — which outbound.ts treats as "refresh is off", not an error.
 */
export function parseServiceAccountKey(raw: string | undefined | null): ServiceAccountKey | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const clientEmail = (parsed as Record<string, unknown>).client_email;
  const privateKey = (parsed as Record<string, unknown>).private_key;
  if (typeof clientEmail !== "string" || !clientEmail.includes("@")) return null;
  if (typeof privateKey !== "string" || !privateKey.includes("-----BEGIN")) return null;

  return { clientEmail, privateKey };
}

/** Where the app trades a signed assertion for an access token. */
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** The one scope the app credential is ever asked for — nothing writes to the database with it. */
export const CHAT_BOT_SCOPE = "https://www.googleapis.com/auth/chat.bot";

/**
 * The JWT claims a token request signs, per Google's service-account
 * flow: who is asking (`iss`), for what (`scope`), of whom (`aud`), and
 * for how long (`iat`/`exp` — Google caps this at one hour, so `exp` is
 * always exactly `iat + 3600`).
 */
export function assertionClaims(
  clientEmail: string,
  nowSeconds: number,
): { iss: string; scope: string; aud: string; iat: number; exp: number } {
  const iat = Math.floor(nowSeconds);
  return { iss: clientEmail, scope: CHAT_BOT_SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 };
}

/** The PATCH address for rewriting one card's message — cardsV2 is the only field ever touched. */
export function patchUrl(messageName: string): string {
  return `https://chat.googleapis.com/v1/${messageName}?updateMask=cardsV2`;
}

/**
 * Whether a cached access token is still good to use. A minute of slack
 * before the real expiry means a call never sets out with a token about
 * to die mid-flight; `null` (nothing cached yet) is always stale.
 */
export function tokenIsFresh(expiresAtSeconds: number | null, nowSeconds: number): boolean {
  if (typeof expiresAtSeconds !== "number") return false;
  return nowSeconds < expiresAtSeconds - 60;
}

// The whole refresh must never make Google wait — the answer to a press
// has a 30s budget and the refresh gets five of it.
export const REFRESH_TIMEOUT_MS = 5000;
