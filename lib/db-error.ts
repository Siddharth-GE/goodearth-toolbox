import type { ActionState } from "./action-state";

/**
 * Turns a database error into a sentence for a person. Guard triggers refuse in plain English, so the
 * "P0001: " prefix is stripped and those pass through; anything else gets the action's fallback.
 */

/** "P0001: A draft can no longer be edited" → "A draft can no longer be edited". */
export function stripDbPrefix(message: string): string {
  return message.replace(/^.*?:\s*/, "");
}

/** With `phrases`, only messages containing one pass through; without, all do. Never empty: that reads as success. */
export function dbErrorMessage(
  error: { message: string },
  fallback: string,
  phrases?: readonly string[],
): string {
  const message = error.message ?? "";
  const passes = phrases ? phrases.some((phrase) => message.includes(phrase)) : true;
  return (passes ? stripDbPrefix(message) : "") || fallback;
}

export function guardError(
  error: { message: string },
  fallback: string,
  phrases?: readonly string[],
): ActionState {
  return { error: dbErrorMessage(error, fallback, phrases) };
}
