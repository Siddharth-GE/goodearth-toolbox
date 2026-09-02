import type { ActionState } from "./action-state";

/**
 * Turning a database error into the sentence a person sees.
 *
 * The guard triggers and functions in supabase/migrations refuse with
 * plain-English messages on purpose — "This trail only has 3 legs",
 * "A draft can no longer be edited" — and those are worth showing as
 * they are. Postgres prefixes them ("P0001: …", "new row violates …: …"),
 * so the prefix up to the first colon is stripped. Everything else a
 * database can say (a constraint name, a type error) is not for a
 * person, and is replaced by the action's own fallback.
 *
 * Seven tools carried their own copy of this under three names; the
 * shape they shared is here, and each tool keeps only its list of the
 * phrases its own guards raise, beside the actions that read them.
 *
 * Import-light on purpose: file-level "use server" modules import this
 * (the lib/action-state.ts rule).
 */

/** "P0001: A draft can no longer be edited" → "A draft can no longer be edited". */
export function stripDbPrefix(message: string): string {
  return message.replace(/^.*?:\s*/, "");
}

/**
 * The message to show. With `phrases`, the database's own words pass
 * through only when they contain one of them — a guard's refusal — and
 * anything else gets the fallback. Without, every message passes through,
 * and the fallback covers an empty one. Never empty: an empty error
 * would read as success to the form.
 */
export function dbErrorMessage(
  error: { message: string },
  fallback: string,
  phrases?: readonly string[],
): string {
  const message = error.message ?? "";
  const passes = phrases ? phrases.some((phrase) => message.includes(phrase)) : true;
  return (passes ? stripDbPrefix(message) : "") || fallback;
}

/** dbErrorMessage as the ActionState an action returns. */
export function guardError(
  error: { message: string },
  fallback: string,
  phrases?: readonly string[],
): ActionState {
  return { error: dbErrorMessage(error, fallback, phrases) };
}
