/**
 * Is this read failure worth trying again?
 *
 * Reads in this codebase throw rather than hand back half an answer
 * (fetch-all.ts says why). That is the right call for a genuine failure
 * — but it also means one dropped connection blanks a whole page with
 * "Something went wrong", which is what the Operations tools did on the
 * evening of 16 Aug 2026: intermittent, every tool, gone by morning.
 *
 * So the throw stays and a bounded retry goes in front of it. The whole
 * question is which failures deserve one. A dropped connection will
 * probably succeed on the next attempt; an RLS refusal, a constraint
 * violation or a malformed filter will fail identically three times and
 * only make the user wait longer for the same message. Retrying those
 * would also turn a fast, clear refusal into a slow, vague one.
 *
 * So: retry the connection, never the answer. Anything not named here is
 * treated as permanent, which is the safe default — the worst case is
 * the behaviour we already have today.
 *
 * Pure and dependency-free so it can be unit-tested without a database
 * (CLAUDE.md: pure logic only).
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

/**
 * Node puts the real network failure in `code` as a syscall name, not a
 * SQLSTATE — usually one level down in `cause`, under undici's flat
 * "fetch failed".
 */
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

/**
 * Network-level failures surface with no SQLSTATE at all — undici gives
 * "fetch failed" and hides the real reason in `cause`, so match on the
 * shapes actually seen rather than on a code that isn't there.
 */
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

export function isTransient(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as MaybeError;
  if (!candidate) return false;

  // PostgREST puts the SQLSTATE in `code`; a numeric code is an HTTP
  // status from the fetch layer instead.
  const code = candidate.code;
  if (typeof code === "string" && TRANSIENT_SQLSTATES.has(code.toUpperCase())) return true;
  if (typeof code === "string" && TRANSIENT_SYSCALLS.has(code.toUpperCase())) return true;
  if (typeof code === "number" && TRANSIENT_STATUSES.has(code)) return true;
  if (typeof code === "string" && /^\d+$/.test(code) && TRANSIENT_STATUSES.has(Number(code))) {
    return true;
  }

  if (typeof candidate.status === "number" && TRANSIENT_STATUSES.has(candidate.status)) return true;

  // A real SQLSTATE that isn't in the list above is a definite answer
  // from the database — a refusal or a constraint. Never retry it, even
  // if the message happens to contain a word like "timeout".
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code.toUpperCase())) return false;

  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  if (message && TRANSIENT_MESSAGES.some((needle) => message.includes(needle))) return true;

  // undici nests the real failure one level down.
  if (candidate.cause && candidate.cause !== error) return isTransient(candidate.cause);

  return false;
}

/**
 * Runs `attempt` up to `tries` times, pausing between retries, and gives
 * up the moment a failure looks permanent.
 *
 * `attempt` returns Supabase's `{ data, error }` rather than throwing, so
 * this inspects the error object instead of catching. Thrown errors (a
 * dropped socket can reach us that way too) are handled as well: a
 * transient one is retried, anything else is rethrown untouched.
 *
 * Delays are short and fixed — this sits in front of a page render, so
 * the ceiling on added latency for a genuinely dead database is about
 * half a second, not the many seconds a full exponential backoff costs.
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

  // Only reachable when every attempt failed transiently; hand back the
  // last error so the caller reports the real reason.
  return lastResult as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
