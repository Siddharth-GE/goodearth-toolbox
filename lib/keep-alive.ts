import { timingSafeEqual } from "node:crypto";

/**
 * Whether the request came from Vercel's cron: Bearer CRON_SECRET, compared with timingSafeEqual.
 * A missing secret is a refusal, never a pass-through.
 */
export function isCronAuthorized(
  authorizationHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  if (!authorizationHeader) return false;
  const [scheme, ...rest] = authorizationHeader.split(" ");
  if (scheme !== "Bearer") return false;
  const presented = Buffer.from(rest.join(" ").trim());
  const expected = Buffer.from(secret);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
