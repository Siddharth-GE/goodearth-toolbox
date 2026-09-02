import "server-only";

/**
 * What a failed read means here: a screen must not render a half answer,
 * so a read that fails throws to app/(dashboard)/error.tsx; the message
 * is logged with the tool's name so the trace says which tool. Six
 * modules used to carry their own copy of this in two shapes.
 */

/** Log and throw. `never`, so `if (error) fail(...)` narrows `data` on the other side. */
export function readFailed(tool: string, context: string, error: { message: string }): never {
  console.error(`${tool}: ${context} failed:`, error);
  throw new Error(`Could not load ${context}.`, { cause: error });
}

/** The assertion form: a no-op when the read succeeded, readFailed otherwise. */
export function assertRead(
  tool: string,
  context: string,
  error: { message: string } | null,
): asserts error is null {
  if (error) readFailed(tool, context, error);
}
