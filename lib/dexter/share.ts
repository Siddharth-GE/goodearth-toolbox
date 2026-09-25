import { randomBytes } from "node:crypto";

/**
 * The share token: 16 random bytes as base64url, 22 characters of
 * [A-Za-z0-9_-]. The database CHECK (0095) and the viewer's regex both
 * pin that exact shape, so a token that is not one is refused before a
 * row is ever read.
 */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}
