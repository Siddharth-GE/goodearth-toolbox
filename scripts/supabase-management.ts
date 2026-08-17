/**
 * The Supabase management API, in one place.
 *
 * Every migration this project has ever applied went through the same
 * endpoint — POST /v1/projects/{ref}/database/query — typed out fresh each
 * time. From 17 Aug 2026 there are two databases and four scripts that
 * need it, so it lives here instead of being copied four ways.
 *
 * WHY NOT THE SUPABASE CLI. No Docker, no local Postgres, no `supabase db
 * push` (CLAUDE.md). The management API is the whole toolchain, and
 * `SUPABASE_ACCESS_TOKEN` in .env.local is account-level, so one token
 * reaches every project in the organisation. That is convenient and it is
 * also the hazard this module exists to fence off.
 *
 * THE ONE RULE. No function here defaults a project ref. Not to
 * production, not to the value in .env.local, not to anything. A caller
 * must name the database it means, on the command line, every time. The
 * cost of that rule is typing twenty characters; the cost of not having
 * it is a script written for staging running against production because
 * a variable was stale.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

/** Supabase project refs are exactly twenty lowercase letters. */
const REF_PATTERN = /^[a-z]{20}$/;

const API = "https://api.supabase.com";

export function managementToken(): string {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN is missing from .env.local. It is the management API key — local only, never in app code.",
    );
  }
  return token;
}

/**
 * Reads a project ref from `--project` (or a named flag), and refuses
 * anything that is not shaped like one.
 *
 * The shape check is not paranoia about typos. It is what stops
 * `--project` picking up the *next* flag when its value was forgotten:
 * `--project --commit` would otherwise send SQL to a project called
 * "--commit" and get a confusing 404 rather than an obvious refusal.
 */
export function requireProjectRef(argv: string[], flag = "--project"): string {
  const at = argv.indexOf(flag);
  if (at === -1) {
    throw new Error(
      `${flag} is required — name the database you mean. Nothing here defaults to production.`,
    );
  }
  const value = argv[at + 1];
  if (!value || !REF_PATTERN.test(value)) {
    throw new Error(
      `${flag} needs a Supabase project ref (twenty lowercase letters), got ${value ?? "nothing"}.`,
    );
  }
  return value;
}

/** True when the caller passed --commit. Every script writes nothing without it. */
export function isCommit(argv: string[]): boolean {
  return argv.includes("--commit");
}

type QueryRow = Record<string, unknown>;

/**
 * Runs SQL against one project and returns its rows.
 *
 * Throws on anything that is not a success — including the API's habit of
 * answering a *failed* query with HTTP 200 and a body of
 * `{ message: "Failed to run sql query: ERROR: ..." }`. Treating that as
 * an empty result set is precisely the mistake CLAUDE.md warns about for
 * PostgREST reads, and it is worse here: it would report a migration
 * applied that in fact errored.
 */
export async function sql<T extends QueryRow = QueryRow>(ref: string, query: string): Promise<T[]> {
  // Retries cover the network dropping and the API answering 5xx — both
  // seen repeatedly while migrating two databases. They deliberately do
  // NOT cover a SQL error, which is deterministic: retrying a syntax
  // error just prints it four times.
  //
  // Retrying a write is safe here because every caller sends either a
  // transaction (all of it happened or none of it did) or an idempotent
  // statement. A half-applied file cannot be silently retried into a
  // worse state.
  let response: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    try {
      response = await fetch(`${API}/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managementToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
    } catch (error) {
      lastError = error;
      continue;
    }
    if (response.status < 500) break;
    lastError = new Error(`HTTP ${response.status}`);
    response = undefined;
  }

  if (!response) {
    throw new Error(
      `${ref}: could not reach the management API after 4 attempts — ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : [];
  } catch {
    throw new Error(`${ref}: unreadable response (HTTP ${response.status}): ${text.slice(0, 400)}`);
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 400);
    throw new Error(`${ref}: HTTP ${response.status} — ${message}`);
  }

  // A query that failed still answers 200; the giveaway is an object with
  // a message where an array of rows belongs.
  if (!Array.isArray(body)) {
    if (body && typeof body === "object" && "message" in body) {
      throw new Error(`${ref}: ${String((body as { message: unknown }).message)}`);
    }
    return [];
  }

  return body as T[];
}

/** A single scalar from a one-row, one-column query. */
export async function scalar<T>(ref: string, query: string): Promise<T | undefined> {
  const rows = await sql(ref, query);
  const first = rows[0];
  if (!first) return undefined;
  return Object.values(first)[0] as T;
}

/**
 * Postgres string literal, doubling single quotes.
 *
 * There is deliberately no general "quote any value" helper here. Row
 * data is moved with jsonb_populate_recordset (see clone-data.ts), which
 * lets Postgres do every type conversion — hand-rolled quoting is how a
 * copy gets one column of one table subtly wrong.
 */
export function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
