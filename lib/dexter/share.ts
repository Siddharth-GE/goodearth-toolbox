import { randomBytes } from "node:crypto";

// 16 random bytes as base64url. The database CHECK (0095) and the viewer's regex pin this shape, so
// a malformed token is refused before any row is read.
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}
