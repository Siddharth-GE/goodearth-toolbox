/**
 * The migration folder and the ledger that says what a database has had.
 *
 * Shared by the two scripts that need the same answer from opposite ends:
 * scripts/apply-migrations.ts, which applies what is missing, and
 * scripts/check-migrations.ts, which only asks and fails if anything is.
 *
 * It exists because scripts/apply-migrations.ts calls main() at module
 * load — importing it to reuse two functions would run the applier. The
 * reading half lives here instead, and writes nothing anywhere.
 *
 * `applied_migrations` (0067) is the source of truth for what a database
 * has had. A filename alone only answers "did something with this name
 * run?"; the checksum answers "did THIS file run?", so an applied
 * migration edited afterwards — which the rulebook forbids — shows up
 * instead of passing unnoticed.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "./supabase-management";

export const MIGRATIONS_DIR = resolve(import.meta.dirname, "..", "supabase", "migrations");

export type Migration = { filename: string; body: string; checksum: string };

export function readMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const body = readFileSync(resolve(MIGRATIONS_DIR, filename), "utf8");
      return {
        filename,
        body,
        checksum: createHash("sha256").update(body).digest("hex"),
      };
    });
}

/**
 * The ledger, or an empty map when the table does not exist yet — which
 * is the normal state of a database that has never been migrated.
 */
export async function readLedger(ref: string): Promise<Map<string, string>> {
  const exists = await sql<{ present: boolean }>(
    ref,
    "select to_regclass('public.applied_migrations') is not null as present",
  );
  if (!exists[0]?.present) return new Map();

  const rows = await sql<{ filename: string; checksum: string }>(
    ref,
    "select filename, checksum from applied_migrations",
  );
  return new Map(rows.map((row) => [row.filename, row.checksum]));
}

export type LedgerComparison = {
  /** In the folder, not in the ledger: this database is behind the code. */
  pending: Migration[];
  /** In both, with different contents: an applied file was edited. */
  mismatched: string[];
};

/** What one database is missing, and what it has under a changed name. */
export function compareToLedger(
  migrations: Migration[],
  ledger: Map<string, string>,
): LedgerComparison {
  const pending: Migration[] = [];
  const mismatched: string[] = [];

  for (const migration of migrations) {
    const recorded = ledger.get(migration.filename);
    if (recorded === undefined) pending.push(migration);
    else if (recorded !== migration.checksum) mismatched.push(migration.filename);
  }

  return { pending, mismatched };
}
