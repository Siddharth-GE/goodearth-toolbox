/**
 * Copies the real master data (people, places, clients, the catalogue) from one
 * database into another, and nothing else.
 *
 *   npx tsx scripts/clone-data.ts --from <ref> --to <ref>            # dry run, writes nothing
 *   npx tsx scripts/clone-data.ts --from <ref> --to <ref> --commit
 *
 * Not copied, on purpose: the transaction chain, test trails, the audit log
 * and every *_counters row (so the first real PO is PO-0001).
 * Ids are preserved, so created_by, updated_by and every foreign key still match.
 * Auth users come whole, with the bcrypt hash and auth.identities, so logins keep passwords.
 * Replica mode: profiles and roles reference each other, so no insert order satisfies
 * every FK; `session_replication_role = replica` turns off FK checks and triggers
 * (handle_new_user etc.), re-set per request since each API call is its own session.
 * Each table is emptied and reloaded, so it refuses to run if GUARD_TABLES hold real
 * work. After go-live this must not be what empties production.
 */
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

// The real data, parents before children. Order is cosmetic under replica mode.
//
// Left out on purpose:
//   the practice chain (selections, budgets, indents, POs, receipts, bills, stock_*, ...);
//   pusher_chains and children (test trails; pusher_chain_departments hangs off them);
//   vendors and stores (one test row each; real ones are entered in Masters);
//   business_plans, business_plan_targets, funding_facilities (built in the tool,
//     not facts about the company, so they belong with the transactions);
//   audit_log, app_errors, login_attempts, auth_verified_sessions;
//   *_counters, so numbering starts at 1.
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
  "pusher_departments",
  "pusher_activities",
  "pusher_trail_sets",
  "pusher_trail_set_items",
  "pusher_project_plans",
];

const AUTH_TABLES = ["users", "identities"];

// Emptied on the target, never copied. Replaying migrations leaves audit rows
// describing rows this script then replaces; production's log should start clean.
const EMPTY_ONLY = ["audit_log"];

// If any of these has a row in the target, real work has started there and this
// script must not empty it. There is no --force: look at what is in them.
const GUARD_TABLES = [
  "selections",
  "budgets",
  "indents",
  "purchase_orders",
  "goods_receipts",
  "bills",
  "stock_issues",
  "client_receipts",
];

const BATCH = 500;

// The writable columns of a table. Generated columns (auth.users.confirmed_at)
// and identity columns are excluded or Postgres rejects the insert; they recompute.
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

// Inserts through jsonb_populate_recordset so Postgres does the type conversion
// (arrays, jsonb, empty strings, nulls) with no hand-rolled quoting.
async function writeRows(
  ref: string,
  schema: string,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<void> {
  // Columns are named on BOTH sides: `select *` would include generated columns.
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

  console.log("Copying...");
  for (const job of jobs) {
    if (job.rows === 0) continue;
    const rows = await readRows(from, job.schema, job.table, job.columns);
    await writeRows(to, job.schema, job.table, job.columns, rows);
    console.log(`  ${String(rows.length).padStart(5)}  ${job.schema}.${job.table}`);
  }

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
