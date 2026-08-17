/**
 * Checks every view in `public` against scripts/view-manifest.ts.
 *
 *   npx tsx scripts/check-view-columns.ts --project <ref>
 *
 * READ-ONLY. Exit 0 means every view is exactly the shape the manifest
 * says. Exit 1 means one of them is not, and prints which and how.
 *
 * WHY. These views are owned by `postgres`, so they bypass row-level
 * security: each one's WHERE clause, column list and grants ARE its whole
 * permission boundary. There is no policy behind them to refuse a
 * careless change, and until this existed the only guard was a comment.
 * Five things go wrong silently, and this catches all five:
 *
 *   1. A COLUMN ADDED to a money-free fact view — the money boundary
 *      crossed with no error anywhere.
 *   2. A `has_app` CHECK LOST from a WHERE clause. Re-running an older
 *      migration as-is is enough to do it, and it strips a whole tool's
 *      access without failing.
 *   3. `security_invoker` LOST from budget_report_lines, which would turn
 *      the one view carrying margins from RLS-respecting into RLS-
 *      bypassing.
 *   4. WRITE PRIVILEGES handed back. `drop view` restores Supabase's
 *      defaults, which include INSERT/UPDATE/DELETE for `authenticated` —
 *      that was a real hole on production, and views bypass RLS, so a
 *      writable view is an RLS bypass with a DELETE on the end.
 *   5. A NEW VIEW that nobody added to the manifest, which would sit
 *      outside this check entirely. An unknown view is a failure.
 *
 * It is deliberately absolute rather than comparative. `db:compare` proves
 * two databases match each other, which is worth having and is not this:
 * two databases can agree and both be wrong.
 */
import { requireProjectRef, sql } from "./supabase-management";
import { VIEW_MANIFEST } from "./view-manifest";

type ViewRow = {
  view_name: string;
  columns: string;
  reloptions: string;
  owner: string;
  definition: string;
  writers: string | null;
};

/** Every app slug named in a has_app(…) call in the definition, sorted. */
function guardsOf(definition: string): string[] {
  const found = [...definition.matchAll(/has_app\('([^']+)'/g)].map((match) => match[1]);
  return [...new Set(found)].sort();
}

function list(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

async function main() {
  const ref = requireProjectRef(process.argv.slice(2));

  const rows = await sql<ViewRow>(
    ref,
    `select v.table_name as view_name,
            (select string_agg(c.column_name, ',' order by c.ordinal_position)
               from information_schema.columns c
              where c.table_schema = 'public' and c.table_name = v.table_name) as columns,
            coalesce(array_to_string(cl.reloptions, ' '), '') as reloptions,
            pg_get_userbyid(cl.relowner) as owner,
            pg_get_viewdef(('public.' || v.table_name)::regclass, true) as definition,
            (select string_agg(distinct g.grantee || ':' || g.privilege_type, ', '
                               order by g.grantee || ':' || g.privilege_type)
               from information_schema.role_table_grants g
              where g.table_schema = 'public' and g.table_name = v.table_name
                and g.grantee in ('anon', 'authenticated')
                and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) as writers
       from information_schema.views v
       join pg_class cl on cl.relname = v.table_name
                       and cl.relnamespace = 'public'::regnamespace
      where v.table_schema = 'public'
      order by v.table_name`,
  );

  const problems: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    seen.add(row.view_name);
    const expected = VIEW_MANIFEST[row.view_name];

    if (!expected) {
      problems.push(
        `${row.view_name}\n` +
          `  NOT IN THE MANIFEST. A view owned by ${row.owner} bypasses row-level security, so\n` +
          `  it needs its shape pinned before it can be trusted. Add it to\n` +
          `  scripts/view-manifest.ts with its columns, its has_app guards, and a sentence\n` +
          `  on why that shape is right. Its columns are:\n    ${row.columns}`,
      );
      continue;
    }

    const actualColumns = (row.columns ?? "").split(",").filter(Boolean);
    if (actualColumns.join(",") !== expected.columns.join(",")) {
      const added = actualColumns.filter((c) => !expected.columns.includes(c));
      const removed = expected.columns.filter((c) => !actualColumns.includes(c));
      problems.push(
        `${row.view_name}\n` +
          `  COLUMNS DIFFER${expected.money ? "" : " — and this view is supposed to carry no money"}.\n` +
          `    added:   ${list(added)}\n` +
          `    removed: ${list(removed)}\n` +
          (added.length === 0 && removed.length === 0
            ? "    (same columns, different order)\n"
            : "") +
          `  ${expected.why}`,
      );
    }

    const actualGuards = guardsOf(row.definition);
    if (actualGuards.join(",") !== expected.guards.join(",")) {
      const lost = expected.guards.filter((g) => !actualGuards.includes(g));
      const gained = actualGuards.filter((g) => !expected.guards.includes(g));
      problems.push(
        `${row.view_name}\n` +
          `  THE WHERE CLAUSE'S GRANT CHECKS DIFFER. This list IS the permission boundary.\n` +
          `    lost:   ${list(lost)}${lost.length > 0 ? "   <- somebody can no longer read this" : ""}\n` +
          `    gained: ${list(gained)}${gained.length > 0 ? "   <- somebody can now read this" : ""}\n` +
          `  ${expected.why}`,
      );
    }

    const barrier = row.reloptions.includes("security_barrier=true");
    const invoker = row.reloptions.includes("security_invoker=true");
    if (barrier !== expected.barrier) {
      problems.push(
        `${row.view_name}\n  security_barrier is ${barrier}, expected ${expected.barrier}.`,
      );
    }
    if (invoker !== expected.invoker) {
      problems.push(
        `${row.view_name}\n` +
          `  security_invoker is ${invoker}, expected ${expected.invoker}.\n` +
          (expected.invoker
            ? "  This view must run as the CALLER so row-level security applies to it.\n"
            : "  This view is meant to bypass RLS by ownership; its WHERE clause is the gate.\n") +
          `  ${expected.why}`,
      );
    }

    if (row.writers) {
      problems.push(
        `${row.view_name}\n` +
          `  WRITABLE: ${row.writers}\n` +
          `  A view is a READ surface. Views bypass row-level security, so a writable one is\n` +
          `  an RLS bypass with a DELETE on the end. \`drop view\` restores these privileges\n` +
          `  every time, and \`revoke ... from public\` does not remove them — name anon and\n` +
          `  authenticated explicitly, in the same migration.`,
      );
    }
  }

  for (const name of Object.keys(VIEW_MANIFEST)) {
    if (!seen.has(name)) {
      problems.push(
        `${name}\n  IN THE MANIFEST BUT NOT ON THIS DATABASE. Either the migration that\n` +
          `  creates it has not been applied here, or the view was dropped and its row\n` +
          `  should go too.`,
      );
    }
  }

  console.log(`Database : ${ref}`);
  console.log(`Views    : ${rows.length} in public, ${Object.keys(VIEW_MANIFEST).length} pinned\n`);

  if (problems.length > 0) {
    console.error(`${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`${problem}\n`);
    console.error(
      "If a change here is intentional, update scripts/view-manifest.ts in the same\n" +
        "commit as the migration, with a sentence saying why the new shape is correct.\n",
    );
    process.exitCode = 1;
    return;
  }

  const money = Object.values(VIEW_MANIFEST).filter((v) => v.money).length;
  console.log(
    `Every view matches the manifest — columns, grant checks, barrier, invoker and\n` +
      `no write privileges. ${money} of them carry money, each behind its own WHERE.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
