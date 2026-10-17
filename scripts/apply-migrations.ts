/**
 * Applies supabase/migrations/*.sql to one named database and records them in the ledger.
 *
 *   npx tsx scripts/apply-migrations.ts --project <ref>                          # dry run, writes nothing
 *   npx tsx scripts/apply-migrations.ts --project <ref> --commit                 # applies what the ledger lacks, in filename order
 *   npx tsx scripts/apply-migrations.ts --project <ref> --commit --record-only   # records every file as applied WITHOUT running it
 *   npx tsx scripts/apply-migrations.ts --project <ref> --commit --only 0068_x.sql   # exactly one file
 *
 * --project is required and never defaulted, so no run can fall back to production.
 * Each file runs in begin/commit with its ledger row in the same transaction, so a
 * failure leaves nothing behind (hence no CREATE INDEX CONCURRENTLY).
 * Bootstrap: the ledger table does not exist until 0067, so the insert is guarded by
 * to_regclass and a reconcile pass records 0001-0066.
 * Checksums catch an applied migration edited afterwards; a mismatch never re-applies.
 */
import { compareToLedger, readLedger, readMigrations, type Migration } from "./migration-ledger";
import { isCommit, requireProjectRef, sql } from "./supabase-management";

// A DO block, not a plain insert, so it is valid before and after 0067 creates the ledger.
function ledgerInsert(migration: Migration): string {
  const filename = migration.filename.replace(/'/g, "''");
  return `
do $ledger$
begin
  if to_regclass('public.applied_migrations') is not null then
    insert into applied_migrations (filename, checksum)
    values ('${filename}', '${migration.checksum}')
    on conflict (filename) do update set checksum = excluded.checksum,
                                         applied_at = now();
  end if;
end $ledger$;`;
}

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);
  const recordOnly = argv.includes("--record-only");

  if (recordOnly && !commit) {
    console.log("--record-only writes the ledger, so it needs --commit too. Nothing done.");
    return;
  }

  const onlyAt = argv.indexOf("--only");
  const only = onlyAt === -1 ? null : argv[onlyAt + 1];
  if (onlyAt !== -1 && (!only || !only.endsWith(".sql"))) {
    console.log(`--only needs a migration filename, got ${only ?? "nothing"}. Nothing done.`);
    return;
  }

  const all = readMigrations();
  if (only && !all.some((migration) => migration.filename === only)) {
    console.log(`No such migration: ${only}. Nothing done.`);
    return;
  }
  const migrations = only ? all.filter((migration) => migration.filename === only) : all;
  const ledger = await readLedger(ref);

  console.log(`Database : ${ref}`);
  console.log(
    `Folder   : ${migrations.length} migration file${migrations.length === 1 ? "" : "s"}${only ? ` (--only ${only})` : ""}`,
  );
  console.log(`Ledger   : ${ledger.size} already recorded`);
  console.log(`Mode     : ${commit ? (recordOnly ? "RECORD ONLY" : "COMMIT") : "dry run"}\n`);

  const { pending, mismatched } = compareToLedger(migrations, ledger);

  if (mismatched.length > 0) {
    console.error("CHANGED SINCE IT WAS APPLIED — an applied migration must never be edited:");
    for (const filename of mismatched) console.error(`  ${filename}`);
    console.error(
      "\nNothing was applied. A correction is a new, later file. If the edit was harmless,\n" +
        "re-record this database with --record-only to accept the current contents.\n",
    );
    process.exitCode = 1;
    return;
  }

  if (pending.length === 0) {
    console.log("Nothing to do — this database already has every migration in the folder.");
    return;
  }

  console.log(`${pending.length} to apply:`);
  for (const migration of pending) console.log(`  ${migration.filename}`);

  if (!commit) {
    console.log("\nDry run. Nothing was written. Re-run with --commit to apply.");
    return;
  }

  console.log("");
  for (const migration of pending) {
    process.stdout.write(`  ${migration.filename} ... `);
    try {
      const statement = recordOnly
        ? ledgerInsert(migration)
        : `begin;\n${migration.body}\n${ledgerInsert(migration)}\ncommit;`;
      await sql(ref, statement);
      console.log(recordOnly ? "recorded" : "applied");
    } catch (error) {
      console.log("FAILED");
      console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
      console.error(
        `Stopped at ${migration.filename}. Nothing from that file was applied, and the\n` +
          `migrations after it have not been attempted. Fix it with a NEW, later file —\n` +
          `never by editing one that has already run somewhere.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  // Bootstrap reconcile: files applied before the ledger table existed have no row yet.
  const after = await readLedger(ref);
  const unrecorded = pending.filter((migration) => !after.has(migration.filename));
  if (unrecorded.length > 0) {
    const values = unrecorded
      .map((m) => `('${m.filename.replace(/'/g, "''")}', '${m.checksum}')`)
      .join(", ");
    await sql(
      ref,
      `insert into applied_migrations (filename, checksum) values ${values}
       on conflict (filename) do update set checksum = excluded.checksum;`,
    );
    console.log(`\n  recorded ${unrecorded.length} earlier files now the ledger table exists`);
  }

  console.log(`\nDone. ${pending.length} ${recordOnly ? "recorded" : "applied"} on ${ref}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
