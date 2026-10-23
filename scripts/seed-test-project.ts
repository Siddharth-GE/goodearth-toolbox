/**
 * Makes the test project and fills its whole chain (scripts/seed-test-project.sql) — the practice database only. Rehearse first:
 *
 *   npx tsx scripts/dry-run-migrations.ts --project <ref> scripts/seed-test-project.sql     # runs it, keeps nothing
 *   npx tsx scripts/seed-test-project.ts --project <ref> --commit                             # makes it for real
 *
 * Settings → Test project's red button deletes it again (delete_test_project, 0142). It refuses to make a second one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DATABASES } from "../lib/environment";
import { isCommit, requireProjectRef, sql } from "./supabase-management";

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  if (ref !== DATABASES.practice) {
    throw new Error(
      `The test project is made on the practice database (${DATABASES.practice}) only — not ${ref}.`,
    );
  }
  if (!isCommit(argv)) {
    console.log(
      "Rehearse with scripts/dry-run-migrations.ts (see the header), then re-run with --commit.",
    );
    return;
  }
  const seed = readFileSync(resolve(import.meta.dirname, "seed-test-project.sql"), "utf8");
  await sql(ref, `begin;\n${seed}\ncommit;`);
  const [made] = await sql<Record<string, number | string>>(
    ref,
    `select p.name,
            (select count(*) from estimator_estimates e where e.project_id = p.id)::int as estimates,
            (select count(*) from indents i where i.project_id = p.id)::int as indents,
            (select count(*) from purchase_orders o where o.project_id = p.id)::int as purchase_orders,
            (select count(*) from goods_receipts g where g.project_id = p.id)::int as deliveries,
            (select count(*) from stock_issues s where s.project_id = p.id)::int as issues,
            (select count(*) from bills b where b.project_id = p.id)::int as bills,
            (select count(*) from drawing_revisions r join units u on u.id = r.unit_id where u.project_id = p.id)::int as drawings
       from projects p where p.is_test`,
  );
  console.log("Made:", made);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
