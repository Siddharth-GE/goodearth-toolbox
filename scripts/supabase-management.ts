/**
 * The Supabase management API, in one place: POST /v1/projects/{ref}/database/query.
 *
 * Not the Supabase CLI: no Docker, no local Postgres, no `supabase db push`
 * (CLAUDE.md). `SUPABASE_ACCESS_TOKEN` is account-level, so one token reaches
 * every project, which is the hazard this module fences off.
 *
 * The one rule: no function here defaults a project ref, not to production
 * and not to .env.local. A caller names the database on the command line
 * every time, so a stale variable can never aim a staging script at production.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

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

// Reads a project ref from `--project` (or a named flag) and refuses anything not
// shaped like one, so `--project --commit` fails loudly instead of 404ing on "--commit".
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

export function isCommit(argv: string[]): boolean {
  return argv.includes("--commit");
}

type QueryRow = Record<string, unknown>;

// Runs SQL against one project and returns its rows. Throws on anything but
// success, including the API's habit of answering a failed query with HTTP 200
// and `{ message: ... }`: treating that as empty would report a failed migration applied.
export async function sql<T extends QueryRow = QueryRow>(ref: string, query: string): Promise<T[]> {
  // Retries cover network drops and 5xx, not SQL errors (deterministic). A write
  // retry is safe because callers send a transaction or an idempotent statement.
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

  // A failed query still answers 200: an object with a message where rows belong.
  if (!Array.isArray(body)) {
    if (body && typeof body === "object" && "message" in body) {
      throw new Error(`${ref}: ${String((body as { message: unknown }).message)}`);
    }
    return [];
  }

  return body as T[];
}

// The project's service-role key, for the scripts that write Storage (the SQL
// endpoint cannot reach it). Held in memory only: never printed or written.
export async function serviceRoleKey(ref: string): Promise<string> {
  const response = await fetch(`${API}/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${managementToken()}` },
  });
  if (!response.ok) {
    throw new Error(`${ref}: could not read API keys (HTTP ${response.status})`);
  }
  const keys = (await response.json()) as { name: string; api_key: string }[];
  const key = keys.find((entry) => entry.name === "service_role")?.api_key;
  if (!key) throw new Error(`${ref}: no service_role key returned`);
  return key;
}

export async function scalar<T>(ref: string, query: string): Promise<T | undefined> {
  const rows = await sql(ref, query);
  const first = rows[0];
  if (!first) return undefined;
  return Object.values(first)[0] as T;
}

// Postgres string literal, doubling single quotes. There is deliberately no
// general quoting helper: row data moves via jsonb_populate_recordset (clone-data.ts).
export function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
