/**
 * Fails if one database lacks any migration in this branch.
 *
 *   npx tsx scripts/check-migrations.ts --project <ref>
 *
 * Read-only: no --commit. Exit 1 means behind, or an applied file was edited.
 * CI runs it on every pull request against the database that branch deploys to
 * (master -> production, staging -> staging), so "apply, then merge" is enforced.
 * `npm run db:apply -- --project <ref>` prints more detail but exits 0.
 * It never applies anything: that would put an unreviewed migration on production from CI.
 */
import { DATABASES } from "../lib/environment";
import { compareToLedger, readLedger, readMigrations } from "./migration-ledger";
import { requireProjectRef } from "./supabase-management";

async function main() {
  const ref = requireProjectRef(process.argv.slice(2));

  const migrations = readMigrations();
  const ledger = await readLedger(ref);
  const { pending, mismatched } = compareToLedger(migrations, ledger);

  console.log(`Database : ${ref}`);
  console.log(`Folder   : ${migrations.length} migration files`);
  console.log(`Ledger   : ${ledger.size} recorded\n`);

  if (mismatched.length > 0) {
    console.error("CHANGED SINCE IT WAS APPLIED — an applied migration must never be edited:");
    for (const filename of mismatched) console.error(`  ${filename}`);
    console.error(
      "\nThis database ran a different version of those files, so nobody can say what\n" +
        "it actually has. A correction is a NEW, later file. If the edit was harmless,\n" +
        "re-record with: npm run db:apply -- --project <ref> --commit --record-only\n",
    );
  }

  if (pending.length > 0) {
    console.error(`NOT APPLIED to ${ref} — ${pending.length} migration(s) this branch needs:`);
    for (const migration of pending) console.error(`  ${migration.filename}`);
    console.error(
      "\nThe code that needs a column must never reach a database without it, so this\n" +
        "branch must not be merged yet. Apply them first:\n\n" +
        `  npm run db:apply -- --project ${ref} --commit\n` +
        `  npm run db:types${ref === DATABASES.practice ? ":staging" : ""}\n\n` +
        "Then push the regenerated types and this check goes green.\n",
    );
  }

  if (pending.length > 0 || mismatched.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`Level. ${ref} has every migration in this branch.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
