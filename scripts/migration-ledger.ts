/**
 * Reads the migration folder and the ledger of what a database has had.
 * Shared by apply-migrations.ts and check-migrations.ts; writes nothing.
 * It is separate because apply-migrations.ts runs main() on import.
 *
 * `applied_migrations` (0067) is the source of truth. The checksum shows an
 * applied migration that was edited afterwards.
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

// The ledger, or an empty map when the table does not exist yet (a never-migrated database).
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
  pending: Migration[];
  mismatched: string[];
};

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
