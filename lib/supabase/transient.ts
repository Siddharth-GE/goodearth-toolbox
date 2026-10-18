/**
 * Is this read failure worth trying again? Retry the connection, never the
 * answer: a refusal, a constraint or a bad filter fails the same way every time.
 * Anything not named here is permanent, the safe default. Pure, so it is tested.
 */

/** Postgres SQLSTATEs that mean "the connection, not the query". */
const TRANSIENT_SQLSTATES = new Set([
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "53300", // too_many_connections
  "53400", // configuration_limit_exceeded
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now — Supabase cold start
  "40001", // serialization_failure
  "40P01", // deadlock_detected
]);

/** HTTP statuses worth another attempt: gateway trouble and back-pressure. */
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Node's network failure, as a syscall name in `code`, often one level down in `cause`. */
const TRANSIENT_SYSCALLS = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/** Network failures carry no SQLSTATE: undici says "fetch failed" and hides why in `cause`. */
const TRANSIENT_MESSAGES = [
  "fetch failed",
  "network",
  "econnreset",
  "econnrefused",
  "epipe",
  "etimedout",
  "eai_again",
  "socket hang up",
  "timeout",
  "terminating connection",
  "server closed the connection",
];

type MaybeError = {
  code?: string | number | null;
  status?: number | null;
  message?: string | null;
  cause?: unknown;
} | null;

/** PGRST303 is a definite no, except "JWT issued at future": a token renewed a moment
 * ago on a clock slightly ahead of the database's (BUGCATCHER #20). */
function isTokenFromTheFuture(candidate: NonNullable<MaybeError>): boolean {
  return (
    candidate.code === "PGRST303" &&
    typeof candidate.message === "string" &&
    candidate.message.toLowerCase().includes("issued at future")
  );
}

export function isTransient(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as MaybeError;
  if (!candidate) return false;

  if (isTokenFromTheFuture(candidate)) return true;

  // A numeric code is an HTTP status from the fetch layer, not a SQLSTATE.
  const code = candidate.code;
  if (typeof code === "string" && TRANSIENT_SQLSTATES.has(code.toUpperCase())) return true;
  if (typeof code === "string" && TRANSIENT_SYSCALLS.has(code.toUpperCase())) return true;
  if (typeof code === "number" && TRANSIENT_STATUSES.has(code)) return true;
  if (typeof code === "string" && /^\d+$/.test(code) && TRANSIENT_STATUSES.has(Number(code))) {
    return true;
  }

  if (typeof candidate.status === "number" && TRANSIENT_STATUSES.has(candidate.status)) return true;

  // Any other real SQLSTATE is the database's answer: never retried, whatever the message says.
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code.toUpperCase())) return false;

  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  if (message && TRANSIENT_MESSAGES.some((needle) => message.includes(needle))) return true;

  // undici nests the real failure one level down.
  if (candidate.cause && candidate.cause !== error) return isTransient(candidate.cause);

  return false;
}

/**
 * Up to `tries` attempts, stopping at the first permanent failure; thrown errors
 * are judged the same way. Short fixed delays: this sits in front of a page render.
 */
export async function withRetry<T extends { error: unknown }>(
  attempt: () => PromiseLike<T>,
  { tries = 3, delaysMs = [150, 400] }: { tries?: number; delaysMs?: number[] } = {},
): Promise<T> {
  let lastResult: T | undefined;

  for (let index = 0; index < tries; index++) {
    let result: T;
    try {
      result = await attempt();
    } catch (thrown) {
      if (index < tries - 1 && isTransient(thrown)) {
        await sleep(delaysMs[index] ?? delaysMs[delaysMs.length - 1] ?? 150);
        continue;
      }
      throw thrown;
    }

    if (!result.error) return result;
    lastResult = result;
    if (index >= tries - 1 || !isTransient(result.error)) return result;
    await sleep(delaysMs[index] ?? delaysMs[delaysMs.length - 1] ?? 150);
  }

  // Every attempt failed transiently: hand back the last real reason.
  return lastResult as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
