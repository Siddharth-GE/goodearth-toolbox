/**
 * Copies the real master data from one database into another.
 *
 *   npx tsx scripts/clone-data.ts --from <ref> --to <ref>
 *       # dry run — reports what it WOULD copy, writes nothing
 *
 *   npx tsx scripts/clone-data.ts --from <ref> --to <ref> --commit
 *
 * WHY THIS EXISTS. On 17 Aug 2026 the databases swapped roles: the one
 * the toolbox was built in keeps every practice selection, budget and PO
 * and becomes staging, and a fresh one takes the real work. This carries
 * across the part that is real — people, places, clients, the catalogue —
 * and nothing else.
 *
 * WHAT IT DOES NOT COPY, and this is the point of the script rather than
 * an omission: the whole transaction chain, Marathon, the test trails,
 * the audit log, and every *_counters row. Leaving the counters behind is
 * what makes the first real purchase order PO-0001.
 *
 * IDS ARE PRESERVED. Every row keeps its primary key, so `created_by`,
 * `updated_by` and every foreign key still point at the same thing. A
 * copy that renumbered would need a mapping table and would get one
 * column wrong somewhere.
 *
 * AUTH USERS COME TOO, WHOLE. profiles references auth.users, so the 49
 * logins must exist with the same ids or every profile breaks. They are
 * copied including `encrypted_password` — the bcrypt hash, not the
 * password — so every account keeps the password it already has and
 * nothing has to be redistributed. auth.identities comes with them, or
 * email and Google sign-in have nothing to match against.
 *
 * REPLICA MODE. profiles references roles and roles references profiles:
 * a genuine cycle, so no insert order exists that satisfies every foreign
 * key. `session_replication_role = replica` turns off FK checking and
 * triggers for the load, which is also what stops handle_new_user() and
 * profiles_seed_staff_details() firing and fighting with the rows being
 * copied. Each request re-sets it, because every call through the
 * management API is its own session.
 *
 * SAFE TO RUN TWICE. Each table is emptied and reloaded. That is only
 * safe while the target has no real work in it, so it refuses to run if
 * it finds any — see GUARD_TABLES. After go-live this script must not be
 * the thing that empties production.
 *
 * NO SEQUENCES TO RESET. The only two in `public` belong to audit_log and
 * app_errors, neither of which is copied.
 */
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

/**
 * The real data, parents before children. Order is cosmetic under replica
 * mode, but a half-finished run reads better when it fails in a sensible
 * place.
 *
 * NOT HERE, deliberately:
 *   selections/budgets/indents/purchase_orders/goods_receipts/bills/
 *   stock_* / labour_contracts / construction_budgets / item_requests
 *     - the practice chain.
 *   marathon_*        - the kiosk starts empty. Also retires the agents
 *                       left on the seeded PIN 1234, which is in public
 *                       git history and could never be fixed by rotating.
 *   pusher_chains / _legs / _events / pusher_chain_departments
 *     - the test trails. pusher_chain_departments looks like Relay setup
 *       and is not: it hangs off pusher_chains, one row per trail.
 *   vendors / stores  - one test row each. Real ones get entered in
 *                       Masters before Purchase Orders and Inventory are
 *                       first used.
 *   audit_log / app_errors / login_attempts / auth_verified_sessions
 *     - records of the old database's own life.
 *   *_counters        - so numbering starts at 1.
 */
const TABLES = [
  "roles",
  "profiles",
  "role_apps",
  "user_apps",
  "staff_departments",
  "staff_details",
  "projects",
  "plots",
  "clients",
  "units",
  "project_stages",
  "construction_stages",
  "space_types",
  "spaces",
  "client_engagements",
  "client_payment_milestones",
  "item_categories",
  "brands",
  "gst_rates",
  "items",
  "business_plans",
  "funding_facilities",
  "pusher_departments",
  "pusher_activities",
  "pusher_trail_sets",
  "pusher_trail_set_items",
  "pusher_project_plans",
];

/** Copied from the auth schema, in this order. */
const AUTH_TABLES = ["users", "identities"];

/**
 * Emptied on the target, never copied.
 *
 * Replaying the migrations fires the audit triggers, so a fresh database
 * arrives with several dozen audit rows describing its own construction —
 * seeded activities, default stages. They are about rows that this script
 * then deletes and replaces, so they document nothing that exists. A
 * production audit log should start on the day production started.
 */
const EMPTY_ONLY = ["audit_log"];

/**
 * If any of these has a row in the target, somebody has started doing
 * real work there and this script must not empty it. There is no --force:
 * the right move is to look at what is in them, not to override a check.
 */
const GUARD_TABLES = [
  "selections",
  "budgets",
  "indents",
  "purchase_orders",
  "goods_receipts",
  "bills",
  "stock_issues",
  "client_receipts",
  "marathon_entries",
];

const BATCH = 500;

/**
 * The columns of a table that can actually be written.
 *
 * Generated columns are excluded, or the insert is rejected outright:
 * auth.users.confirmed_at is computed from the two confirmation
 * timestamps, and Postgres refuses a non-DEFAULT value for it. Identity
 * columns are excluded for the same reason. Neither loses anything —
 * a generated column recomputes itself from the columns that did copy.
 */
async function columnsOf(ref: string, schema: string, table: string): Promise<string[]> {
  const rows = await sql<{ column_name: string }>(
    ref,
    `select column_name from information_schema.columns
     where table_schema = ${literal(schema)} and table_name = ${literal(table)}
       and is_generated = 'NEVER'
       and identity_generation is distinct from 'ALWAYS'
     order by ordinal_position`,
  );
  return rows.map((row) => row.column_name);
}

async function countOf(ref: string, qualified: string): Promise<number> {
  const rows = await sql<{ n: string }>(ref, `select count(*)::text as n from ${qualified}`);
  return Number(rows[0]?.n ?? 0);
}

/** Reads a table as JSON objects, paged, so one huge response cannot fail the run. */
async function readRows(
  ref: string,
  schema: string,
  table: string,
  columns: string[],
): Promise<Record<string, unknown>[]> {
  const projection = columns
    .map((column) => `${literal(column)}, t.${quoteIdent(column)}`)
    .join(", ");
  const out: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += BATCH) {
    const page = await sql<{ row: Record<string, unknown> }>(
      ref,
      `select jsonb_build_object(${projection}) as row
       from ${schema}.${quoteIdent(table)} t
       order by t.ctid
       limit ${BATCH} offset ${offset}`,
    );
    out.push(...page.map((entry) => entry.row));
    if (page.length < BATCH) return out;
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Inserts rows through jsonb_populate_recordset rather than a built-up
 * VALUES list. Postgres does the type conversion, so arrays, jsonb, empty
 * strings and nulls all land as themselves — no hand-rolled quoting to
 * get subtly wrong on one column of one table.
 */
async function writeRows(
  ref: string,
  schema: string,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<void> {
  // The columns are named on BOTH sides. `select *` off the recordset
  // would hand over every column of the row type including the generated
  // ones, which Postgres rejects however carefully the JSON was built.
  const named = columns.map(quoteIdent).join(", ");
  for (let at = 0; at < rows.length; at += BATCH) {
    const batch = rows.slice(at, at + BATCH);
    const target = `${schema}.${quoteIdent(table)}`;
    await sql(
      ref,
      `set session_replication_role = replica;
       insert into ${target} (${named})
       select ${named}
       from jsonb_populate_recordset(null::${target}, ${literal(JSON.stringify(batch))}::jsonb);`,
    );
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const from = requireProjectRef(argv, "--from");
  const to = requireProjectRef(argv, "--to");
  const commit = isCommit(argv);

  if (from === to) {
    console.log("--from and --to are the same database. Nothing done.");
    return;
  }

  console.log(`From : ${from}`);
  console.log(`To   : ${to}`);
  console.log(`Mode : ${commit ? "COMMIT" : "dry run"}\n`);

  // ---- the guard ----------------------------------------------------
  const occupied: string[] = [];
  for (const table of GUARD_TABLES) {
    const rows = await countOf(to, table);
    if (rows > 0) occupied.push(`${table} (${rows})`);
  }
  if (occupied.length > 0) {
    console.error("The target database already has real work in it:");
    for (const entry of occupied) console.error(`  ${entry}`);
    console.error(
      "\nThis script empties every table it copies, so it will not run against a\n" +
        "database somebody is using. Nothing was written.",
    );
    process.exitCode = 1;
    return;
  }

  // ---- plan the copy --------------------------------------------------
  type Job = { schema: string; table: string; columns: string[]; rows: number };
  const jobs: Job[] = [];
  let mismatches = 0;

  for (const [schema, tables] of [
    ["auth", AUTH_TABLES],
    ["public", TABLES],
  ] as const) {
    for (const table of tables) {
      const [source, target] = await Promise.all([
        columnsOf(from, schema, table),
        columnsOf(to, schema, table),
      ]);
      const shared = source.filter((column) => target.includes(column));
      const dropped = source.filter((column) => !target.includes(column));
      if (dropped.length > 0) {
        mismatches += 1;
        console.log(
          `  ! ${schema}.${table}: skipping columns absent in target — ${dropped.join(", ")}`,
        );
      }
      jobs.push({
        schema,
        table,
        columns: shared,
        rows: await countOf(from, `${schema}.${table}`),
      });
    }
  }

  const total = jobs.reduce((sum, job) => sum + job.rows, 0);
  for (const job of jobs) {
    console.log(`  ${String(job.rows).padStart(5)}  ${job.schema}.${job.table}`);
  }
  console.log(`\n  ${total} rows in ${jobs.length} tables`);
  if (mismatches > 0) console.log(`  ${mismatches} table(s) had columns the target does not have`);

  if (!commit) {
    console.log("\nDry run. Nothing was written. Re-run with --commit to copy.");
    return;
  }

  // ---- empty the target, children first -------------------------------
  console.log("\nEmptying the target...");
  for (const table of EMPTY_ONLY) {
    await sql(to, `set session_replication_role = replica; delete from ${quoteIdent(table)};`);
  }
  for (const job of [...jobs].reverse()) {
    await sql(
      to,
      `set session_replication_role = replica;
       delete from ${job.schema}.${quoteIdent(job.table)};`,
    );
  }

  // ---- copy -----------------------------------------------------------
  console.log("Copying...");
  for (const job of jobs) {
    if (job.rows === 0) continue;
    const rows = await readRows(from, job.schema, job.table, job.columns);
    await writeRows(to, job.schema, job.table, job.columns, rows);
    console.log(`  ${String(rows.length).padStart(5)}  ${job.schema}.${job.table}`);
  }

  // ---- confirm ---------------------------------------------------------
  console.log("\nChecking every table arrived...");
  let wrong = 0;
  for (const job of jobs) {
    const landed = await countOf(to, `${job.schema}.${quoteIdent(job.table)}`);
    if (landed !== job.rows) {
      wrong += 1;
      console.error(`  MISMATCH ${job.schema}.${job.table}: source ${job.rows}, target ${landed}`);
    }
  }

  if (wrong > 0) {
    console.error(`\n${wrong} table(s) did not arrive intact.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nDone. ${total} rows copied, every table matches.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
