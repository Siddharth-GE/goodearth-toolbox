// The pure half of the app's own voice (see outbound.ts): every deciding branch is testable here. Imports nothing.

export type ServiceAccountKey = { clientEmail: string; privateKey: string };

// Never throws: unusable JSON or missing fields is null, which means "refresh is off".
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

export const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** The one scope the app credential is ever asked for — nothing writes to the database with it. */
export const CHAT_BOT_SCOPE = "https://www.googleapis.com/auth/chat.bot";

// Google caps a token at one hour, so exp is iat + 3600.
export function assertionClaims(
  clientEmail: string,
  nowSeconds: number,
): { iss: string; scope: string; aud: string; iat: number; exp: number } {
  const iat = Math.floor(nowSeconds);
  return { iss: clientEmail, scope: CHAT_BOT_SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 };
}

export function patchUrl(messageName: string): string {
  return `https://chat.googleapis.com/v1/${messageName}?updateMask=cardsV2`;
}

// A minute of slack so a call never starts with a token about to die.
export function tokenIsFresh(expiresAtSeconds: number | null, nowSeconds: number): boolean {
  if (typeof expiresAtSeconds !== "number") return false;
  return nowSeconds < expiresAtSeconds - 60;
}

// The press has a 30s budget; the refresh gets five.
export const REFRESH_TIMEOUT_MS = 5000;
