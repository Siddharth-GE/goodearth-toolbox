/**
 * Applies supabase/migrations/*.sql to one named database, and records
 * what it applied.
 *
 *   npx tsx scripts/apply-migrations.ts --project <ref>
 *       # dry run — says what it WOULD apply, writes nothing
 *
 *   npx tsx scripts/apply-migrations.ts --project <ref> --commit
 *       # applies everything not already in the ledger, in filename order
 *
 *   npx tsx scripts/apply-migrations.ts --project <ref> --commit --record-only
 *       # records every file as applied WITHOUT running it — for the
 *       # database that already had all of them applied by hand
 *
 *   npx tsx scripts/apply-migrations.ts --project <ref> --commit --only 0068_x.sql
 *       # applies exactly one file. This is the normal move when a new
 *       # migration goes to staging ahead of the code that needs it, and
 *       # it is how the ledger table itself gets created on a database
 *       # that already has everything else.
 *
 * WHY THIS EXISTS. Sixty-six migrations were applied to one database by
 * hand, and nothing recorded that they were. That was survivable with one
 * database and one person. With two databases it is not: they drift, and
 * the drift is silent until a screen breaks on one and not the other.
 * See 0067_migration_ledger.sql.
 *
 * --project IS REQUIRED AND NEVER DEFAULTED. Not to production, not to
 * .env.local. See scripts/supabase-management.ts for why.
 *
 * HOW A FILE IS APPLIED. Wrapped in begin/commit, so a file that fails
 * half way leaves nothing behind — the next run starts it cleanly rather
 * than tripping over half of itself. Its ledger row is written inside the
 * same transaction, so "applied" and "recorded as applied" cannot come
 * apart. (No migration here uses CREATE INDEX CONCURRENTLY, which is the
 * one thing that cannot run inside a transaction. Two files mention the
 * word in comments only.)
 *
 * THE BOOTSTRAP. On an empty database the ledger table does not exist
 * until 0067 creates it, so the per-file ledger insert is guarded by
 * to_regclass and simply does nothing for 0001–0066. A reconcile pass at
 * the end records those, once there is a table to record them in.
 *
 * CHECKSUMS. A filename only answers "did something with this name run?".
 * The checksum answers "did THIS file run?" — so an applied migration
 * that was edited afterwards, which the rulebook forbids, shows up as a
 * mismatch instead of passing unnoticed. A mismatch never re-applies the
 * file; it reports and exits non-zero, because the honest answer is that
 * nobody knows what that database actually has.
 *
 * SAFE TO RUN TWICE. Anything already in the ledger is skipped, so a
 * second run against the same database does nothing at all.
 */
import { compareToLedger, readLedger, readMigrations, type Migration } from "./migration-ledger";
import { isCommit, requireProjectRef, sql } from "./supabase-management";

/**
 * Records a file as applied, but only once there is a table to record it
 * in. Written as a DO block rather than a plain insert so the same
 * statement is valid before and after 0067 has run.
 */
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

  // The bootstrap reconcile: anything applied before 0067 created the
  // ledger table has no row yet, because its guarded insert found nothing
  // to insert into.
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
