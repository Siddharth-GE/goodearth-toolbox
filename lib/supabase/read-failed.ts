import "server-only";

/** A failed read throws to the error screen, never a half answer, logged with the tool's name. */

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
