// The pure half of acting as one of our Google service accounts (see service-account.ts): the
// Chat door's card refresh and push notifications. Imports nothing.

export type ServiceAccountKey = {
  clientEmail: string;
  privateKey: string;
  projectId: string | null;
};

// Never throws: unusable JSON or missing fields is null, which means "that feature is off".
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
  const projectId = (parsed as Record<string, unknown>).project_id;
  if (typeof clientEmail !== "string" || !clientEmail.includes("@")) return null;
  if (typeof privateKey !== "string" || !privateKey.includes("-----BEGIN")) return null;

  return {
    clientEmail,
    privateKey,
    projectId: typeof projectId === "string" && projectId ? projectId : null,
  };
}

export const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Google caps a token at one hour, so exp is iat + 3600.
export function assertionClaims(
  clientEmail: string,
  scope: string,
  nowSeconds: number,
): { iss: string; scope: string; aud: string; iat: number; exp: number } {
  const iat = Math.floor(nowSeconds);
  return { iss: clientEmail, scope, aud: TOKEN_URL, iat, exp: iat + 3600 };
}

// A minute of slack so a call never starts with a token about to die.
export function tokenIsFresh(expiresAtSeconds: number | null, nowSeconds: number): boolean {
  if (typeof expiresAtSeconds !== "number") return false;
  return nowSeconds < expiresAtSeconds - 60;
}
