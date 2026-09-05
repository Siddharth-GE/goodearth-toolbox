import { timingSafeEqual } from "node:crypto";

/**
 * Whether a request to /api/keep-alive came from Vercel's cron.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` with every cron
 * invocation once CRON_SECRET is set in the project's environment. The
 * comparison is timingSafeEqual so a guess can't be narrowed one byte
 * at a time; a missing secret is a refusal, never a pass-through.
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
