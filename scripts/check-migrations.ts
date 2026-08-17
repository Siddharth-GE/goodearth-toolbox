/**
 * Asks one database whether it has every migration in this branch, and
 * fails if it does not.
 *
 *   npx tsx scripts/check-migrations.ts --project <ref>
 *
 * READ-ONLY. It writes nothing to either database, so there is no
 * --commit and no dry run. Exit 0 means that database is level with the
 * folder; exit 1 means it is behind, or an applied file has been edited.
 *
 * WHY THIS EXISTS. "Apply the migration to production, THEN merge" is a
 * rule kept by remembering it, and every other rule of that shape in this
 * repo has been broken at least once. The ledger has always known the
 * answer — nothing asked at the moment it mattered.
 *
 * So CI asks, on every pull request, against the database that pull
 * request's branch deploys to: a PR into master is checked against
 * production, a PR into staging against staging. A missing migration is
 * then a red X next to the six checks already there, and it clears the
 * moment the migration is applied. Nothing new to remember.
 *
 * `npm run db:apply -- --project <ref>` (no --commit) prints the same
 * thing in more detail and is the friendlier local tool. The difference
 * is only the exit code: a dry run reports and succeeds, because printing
 * a plan is not a failure. This one fails, because being asked and
 * answering "production is missing 0071" is.
 *
 * IT CANNOT APPLY ANYTHING, and that is deliberate. A check that fixes
 * what it finds would apply an unreviewed migration to production from
 * CI, on a database with no backups.
 */
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
        `  npm run db:types${ref === "ipstebqawrvhkyntctrv" ? ":staging" : ""}\n\n` +
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
