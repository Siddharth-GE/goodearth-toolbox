/**
 * Runs migration files (and an optional trial) inside ONE transaction that
 * always aborts — a parse-and-assert check that keeps nothing.
 *
 * WHY. A migration reaches `db:apply` only after its review (MODELS.md),
 * but a typo or a failing assert is cheaper to find before the review
 * than during it. This sends `begin; <files>; <trial>; raise; rollback;`
 * through the management API: every statement runs, every migration's
 * own asserts run, a trial can exercise the new triggers — and the final
 * raise guarantees nothing is committed. "DRY RUN COMPLETE" (or the
 * trial's own "ALL TRIALS PASSED") is success; any other error is the
 * first thing that failed.
 *
 * Staging only: it refuses the production ref by design, however safe
 * the rollback.
 *
 *   npx tsx scripts/dry-run-migrations.ts --project <ref> \
 *     supabase/migrations/0101_x.sql … [--trial scripts/trials/erp-chain.sql]
 */
import { readFileSync } from "node:fs";

import { requireProjectRef, sql } from "./supabase-management";

const PRODUCTION = "pajfrgnkapicdgangjey";

const argv = process.argv.slice(2);
const ref = requireProjectRef(process.argv);
if (ref === PRODUCTION) {
  throw new Error("dry-run-migrations refuses production — run it on staging.");
}

const trialAt = argv.indexOf("--trial");
const trial = trialAt === -1 ? "" : readFileSync(argv[trialAt + 1], "utf8");
const skip = new Set([
  argv.indexOf("--project"),
  argv.indexOf("--project") + 1,
  trialAt,
  trialAt + 1,
]);
const files = argv.filter((arg, index) => !skip.has(index) && arg.endsWith(".sql"));
if (files.length === 0) throw new Error("Name at least one migration file.");

const body = files.map((file) => `-- ${file}\n${readFileSync(file, "utf8")}`).join("\n");
const text = `begin;\n${body}\n${trial}\ndo $dry$ begin raise exception 'DRY RUN COMPLETE — rolled back'; end $dry$;\nrollback;`;

// tsx runs scripts as CommonJS here, so no top-level await.
void (async () => {
  try {
    await sql(ref, text);
    console.log("UNEXPECTED: the transaction did not abort. Check the database at once.");
    process.exit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const ok = /DRY RUN COMPLETE|ALL TRIALS PASSED/.test(message);
    console.log(ok ? "OK — every statement and assert ran; nothing was kept." : message);
    process.exit(ok ? 0 : 1);
  }
})();
