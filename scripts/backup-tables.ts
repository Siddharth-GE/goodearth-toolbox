/**
 * Writes whole tables to JSON before a script deletes or replaces rows in
 * them, so the change can be undone by hand. Files land in
 * data/backups/<time>-<ref>-<label>/<table>.json — data/ is gitignored,
 * because the rows include bank details and client money.
 *
 * Read in pages of 1,000 so a large table (the audit log) never meets the
 * management API's response limit in one go.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "./supabase-management";

const PAGE = 1000;

export async function backupTables(
  ref: string,
  label: string,
  tables: readonly string[],
): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = resolve(import.meta.dirname, "..", "data", "backups", `${stamp}-${ref}-${label}`);
  mkdirSync(dir, { recursive: true });

  for (const table of tables) {
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const [page] = await sql<{ rows: unknown[] | null }>(
        ref,
        `select json_agg(t) as rows from (select * from ${table} order by ctid offset ${offset} limit ${PAGE}) t`,
      );
      const got = page?.rows ?? [];
      rows.push(...got);
      if (got.length < PAGE) break;
    }
    writeFileSync(resolve(dir, `${table}.json`), JSON.stringify(rows));
  }
  return dir;
}
