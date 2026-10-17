/**
 * Deletes every drawing in Design Management (sets, revisions, sheets, work links,
 * transmittals, numbering) and the files in the `drawings` bucket. Design stages stay.
 *
 *   npx tsx scripts/wipe-drawings.ts --project <ref>            # counts only
 *   npx tsx scripts/wipe-drawings.ts --project <ref> --commit   # deletes
 *
 * For a person to run, not a model session: auto mode rightly refuses a bulk cloud delete.
 * It bypasses the guards: issued transmittals and released revisions refuse deletion via
 * triggers (0091, 0093), so the deletes run in ONE transaction with
 * `session_replication_role = replica` (triggers, FK checks and audit rows off for that
 * transaction only). All or nothing.
 * Rows first, then files, so a failure leaves an unreachable file, never a dangling row.
 * Files go through the Storage API: the platform refuses direct deletes from storage.objects.
 * --project is required and never defaults (supabase-management.ts).
 */
import { createClient } from "@supabase/supabase-js";

import { isCommit, requireProjectRef, serviceRoleKey, sql } from "./supabase-management";

const BUCKET = "drawings";

const TABLES = [
  "transmittal_lines",
  "transmittals",
  "transmittal_counters",
  "drawing_revision_works",
  "drawing_revision_files",
  "drawing_revision_folder_sheets",
  "drawing_revisions",
  "drawing_set_works",
  "drawing_sets",
] as const;

type Storage = ReturnType<typeof createClient>["storage"];

async function counts(ref: string): Promise<{ t: string; n: number }[]> {
  const rows = await sql<{ t: string; n: number }>(
    ref,
    [
      ...TABLES.map((table) => `select '${table}' as t, count(*)::int as n from ${table}`),
      `select 'storage: ${BUCKET}' as t, count(*)::int as n from storage.objects where bucket_id = '${BUCKET}'`,
    ].join(" union all "),
  );
  console.table(rows);
  return rows;
}

async function listAll(storage: Storage, prefix = ""): Promise<string[]> {
  const { data, error } = await storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`Could not list ${BUCKET}/${prefix}: ${error.message}`);
  const paths: string[] = [];
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) paths.push(...(await listAll(storage, path)));
    else paths.push(path);
  }
  return paths;
}

async function main() {
  const ref = requireProjectRef(process.argv);

  console.log(`${ref}: before`);
  await counts(ref);

  if (!isCommit(process.argv)) {
    console.log("Dry run — nothing deleted. Add --commit to delete all of the above.");
    return;
  }

  await sql(
    ref,
    `begin;
     set local session_replication_role = replica;
     ${TABLES.map((table) => `delete from ${table};`).join("\n     ")}
     commit;`,
  );
  console.log("Rows deleted.");

  const storage = createClient(`https://${ref}.supabase.co`, await serviceRoleKey(ref), {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
  const paths = await listAll(storage);
  for (let at = 0; at < paths.length; at += 100) {
    const { error } = await storage.from(BUCKET).remove(paths.slice(at, at + 100));
    if (error) throw new Error(`Could not remove files from ${BUCKET}: ${error.message}`);
  }
  console.log(`${paths.length} files removed from ${BUCKET}.`);

  console.log(`${ref}: after`);
  const left = (await counts(ref)).filter((row) => row.n > 0);
  if (left.length > 0) {
    throw new Error(`Not empty afterwards: ${left.map((row) => row.t).join(", ")}`);
  }
  console.log("Every drawing is gone. Design stages are untouched.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
