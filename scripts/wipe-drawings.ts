/**
 * Deletes every drawing in Design Management — sets, revisions, sheets,
 * work links, transmittals and their numbering — and the sheet files in
 * the `drawings` bucket. Design stages (the master list) stay.
 *
 * Founder, 2026-09-27: "delete all drawings on the app, and wherever it
 * is associated which is only supervisors basically". Supervisors keeps
 * no copy of its own: it reads released drawings through lib/drawings/,
 * so emptying these tables empties its Drawings section too.
 *
 * For a person to run, not a model session: a model's auto mode refuses
 * a bulk delete from cloud storage, rightly, and the founder chose to run
 * this themselves.
 *
 * WHY IT BYPASSES THE GUARDS. An issued transmittal and a released
 * revision refuse deletion through their guard triggers (0091, 0093) —
 * rightly, for everyday use. A wipe is the one case that must get past
 * them, so the deletes run in ONE transaction with
 * `session_replication_role = replica`, which switches every trigger off
 * for that transaction only (the guards, the FK checks and the audit
 * rows). The whole transaction lands or none of it does.
 *
 * Rows first, then files — the order the app uses on the way out, so a
 * failure part-way leaves an unreachable file, never a row pointing at a
 * file that is gone. Files go through the Storage API: the platform
 * refuses direct deletes from storage.objects.
 *
 *   npx tsx scripts/wipe-drawings.ts --project <ref>            # counts only
 *   npx tsx scripts/wipe-drawings.ts --project <ref> --commit   # deletes
 *
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

/** Every object path in the bucket; a folder has no id in the listing. */
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
