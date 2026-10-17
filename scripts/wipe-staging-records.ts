/**
 * Clears every record people made in the tools on STAGING so the team can start again
 * from the final masters workbook. Run it before scripts/import-masters-workbook.ts.
 *
 *   npx tsx scripts/wipe-staging-records.ts --project <ref>            # counts only
 *   npx tsx scripts/wipe-staging-records.ts --project <ref> --commit   # back up, then delete
 *
 * Lists below: CLEARED (deleted), BLANKED (each villa's payment schedule keeps its nine
 * steps, which the app cannot re-add, and loses amounts, dates and invoices) and KEPT
 * (people, logins, access, clients, plots, design catalogue, Relay setup, Marathon). Every
 * table must be on one list, so a newly added table stops the run until someone decides.
 * PRACTICE DATABASE ONLY (`lib/environment.ts`): it refuses any other ref.
 * Every row and file is first written to data/backups/ (gitignored), and it refuses if a
 * kept table points at a cleared one.
 * It bypasses the guards, as wipe-drawings.ts does: ONE transaction with
 * `session_replication_role = replica`, whole tables only; the kept-points-at-cleared
 * check stands in for the FK checks. Rows first, then files.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { DATABASES } from "../lib/environment";
import { backupTables } from "./backup-tables";
import { isCommit, literal, requireProjectRef, serviceRoleKey, sql } from "./supabase-management";

const CLEARED = [
  "indent_lines",
  "indents",
  "indent_counters",
  "purchase_order_lines",
  "purchase_orders",
  "po_counters",
  "goods_receipt_lines",
  "goods_receipts",
  "grn_counters",
  "stock_issue_lines",
  "stock_issues",
  "iss_counters",
  "stock_adjustments",
  "issue_requests",
  "bills",
  "bill_counters",
  "labour_contracts",
  "labour_logs",
  "budget_lines",
  "budgets",
  "construction_budget_lines",
  "construction_budgets",
  // Estimator: estimates, and the rate book's material recipes
  "estimator_estimate_item_rates",
  "estimator_estimate_line_components",
  "estimator_estimate_line_costs",
  "estimator_estimate_line_measurements",
  "estimator_estimate_takeoff",
  "estimator_reconciliation_approvals",
  "estimator_estimate_lines",
  "estimator_estimates",
  "est_counters",
  "estimator_work_components",
  "estimator_mix_components",
  "estimator_mixes",
  "estimator_materials",
  "selection_lines",
  "selections",
  "space_views",
  "spaces",
  "design_step_events",
  "design_step_people",
  "design_steps",
  "design_actions",
  "transmittal_lines",
  "transmittals",
  "transmittal_counters",
  "drawing_revision_works",
  "drawing_revision_files",
  "drawing_revision_folder_sheets",
  "drawing_revisions",
  "drawing_set_works",
  "drawing_sets",
  "pusher_chain_links",
  "pusher_chain_events",
  "pusher_chain_legs",
  "pusher_chain_departments",
  "pusher_chains",
  "dexter_answers",
  "dexter_decks",
  "dexter_projects",
  "client_receipts",
  "business_plan_targets",
  "business_plans",
  "funding_movements",
  "funding_facilities",
  "reports",
  "item_requests",
  "app_errors",
  "audit_log",
] as const;

const KEPT = [
  "applied_migrations",
  "auth_verified_sessions",
  "login_attempts",
  "profiles",
  "staff_details",
  "staff_departments",
  "user_apps",
  "role_apps",
  "roles",
  "bill_approvers",
  "indent_approvers",
  "clients",
  "client_engagements",
  "projects",
  "plots",
  "units",
  "stores",
  // Masters — the workbook import replaces vendors, works, materials and stages
  "brands",
  "gst_rates",
  "items",
  "item_categories",
  "item_margins",
  "uoms",
  "estimator_uoms",
  "estimator_work_info",
  "construction_stages",
  "design_stages",
  "space_types",
  "vendors",
  "vendor_payment_details",
  "work_categories",
  "work_groups",
  "work_items",
  "project_stages",
  "pusher_activities",
  "pusher_departments",
  "pusher_project_plans",
  "pusher_trail_sets",
  "pusher_trail_set_items",
  "google_chat_spaces",
  "marathon_agents",
  "marathon_categories",
  "marathon_config",
  "marathon_entries",
  "marathon_groups",
  "marathon_pin_attempts",
  "marathon_runs",
] as const;

const BLANKED = [
  {
    table: "client_payment_milestones",
    columns: ["due_amount", "due_on", "invoice_no", "invoiced_on", "note"],
  },
] as const;

const BUCKETS = ["dexter", "drawings", "design-views"] as const;

type Storage = ReturnType<typeof createClient>["storage"];

const array = (names: readonly string[]) => `array[${names.map(literal).join(", ")}]::text[]`;

const filled = (columns: readonly string[]) => columns.map((c) => `${c} is not null`).join(" or ");

async function counts(ref: string): Promise<{ t: string; n: number }[]> {
  return sql<{ t: string; n: number }>(
    ref,
    [
      ...CLEARED.map((table) => `select '${table}' as t, count(*)::int as n from ${table}`),
      ...BLANKED.map(
        ({ table, columns }) =>
          `select '${table} (to blank)' as t, count(*)::int as n from ${table} where ${filled(columns)}`,
      ),
      ...BUCKETS.map(
        (bucket) =>
          `select 'storage: ${bucket}' as t, count(*)::int as n from storage.objects where bucket_id = '${bucket}'`,
      ),
    ].join(" union all "),
  );
}

async function unlisted(ref: string): Promise<string[]> {
  const rows = await sql<{ t: string }>(
    ref,
    `select c.relname as t from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relkind in ('r', 'p')
       and not (c.relname = any(${array([...CLEARED, ...BLANKED.map((b) => b.table), ...KEPT])}))
     order by 1`,
  );
  return rows.map((row) => row.t);
}

// Rows in a kept table that point at a cleared one would be left pointing at nothing.
async function keptPointingAtCleared(ref: string): Promise<string[]> {
  const fks = await sql<{ child: string; cols: string[]; parent: string }>(
    ref,
    `select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent,
            array(select a.attname::text from unnest(c.conkey) with ordinality k(n, i)
                  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.i) as cols
     from pg_constraint c
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace
       and c.confrelid::regclass::text = any(${array(CLEARED)})
       and not (c.conrelid::regclass::text = any(${array(CLEARED)}))`,
  );
  if (fks.length === 0) return [];
  const found = await sql<{ ref: string; n: number }>(
    ref,
    fks
      .map(
        (fk) =>
          `select '${fk.child}.${fk.cols.join(",")} -> ${fk.parent}' as ref, count(*)::int as n
           from ${fk.child} where ${fk.cols.map((col) => `${col} is not null`).join(" and ")}`,
      )
      .join(" union all "),
  );
  return found.filter((row) => row.n > 0).map((row) => `${row.ref}: ${row.n} rows`);
}

async function listAll(storage: Storage, bucket: string, prefix = ""): Promise<string[]> {
  const { data, error } = await storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
  const paths: string[] = [];
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) paths.push(...(await listAll(storage, bucket, path)));
    else paths.push(path);
  }
  return paths;
}

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  if (ref !== DATABASES.practice) {
    throw new Error(
      `This clears every record in the tools and runs on the practice database (${DATABASES.practice}) only — not ${ref}.`,
    );
  }

  const missing = await unlisted(ref);
  if (missing.length > 0) {
    throw new Error(
      `Tables on no list: ${missing.join(", ")}. Decide whether each is a record (CLEARED) or setup (KEPT) first.`,
    );
  }
  const dangling = await keptPointingAtCleared(ref);
  if (dangling.length > 0) {
    throw new Error(
      `Kept tables point at cleared ones — nothing deleted:\n  ${dangling.join("\n  ")}`,
    );
  }

  console.log(`${ref}: before`);
  console.table((await counts(ref)).filter((row) => row.n > 0));

  if (!isCommit(argv)) {
    console.log("Dry run — nothing deleted. Add --commit to back up and delete all of the above.");
    return;
  }

  const storage = createClient(`https://${ref}.supabase.co`, await serviceRoleKey(ref), {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;

  const dir = await backupTables(ref, "wipe", [...CLEARED, ...BLANKED.map((b) => b.table)]);
  const files = new Map<string, string[]>();
  for (const bucket of BUCKETS) {
    const paths = await listAll(storage, bucket);
    files.set(bucket, paths);
    for (const path of paths) {
      const { data, error } = await storage.from(bucket).download(path);
      if (error || !data) throw new Error(`Could not back up ${bucket}/${path}: ${error?.message}`);
      const target = resolve(dir, "storage", bucket, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(await data.arrayBuffer()));
    }
  }
  console.log(`Backed up to ${dir}`);

  await sql(
    ref,
    `begin;
     set local session_replication_role = replica;
     ${CLEARED.map((table) => `delete from ${table};`).join("\n     ")}
     ${BLANKED.map(
       ({ table, columns }) =>
         `update ${table} set ${columns.map((c) => `${c} = null`).join(", ")} where ${filled(columns)};`,
     ).join("\n     ")}
     commit;`,
  );
  console.log("Rows deleted.");

  for (const [bucket, paths] of files) {
    for (let at = 0; at < paths.length; at += 100) {
      const { error } = await storage.from(bucket).remove(paths.slice(at, at + 100));
      if (error) throw new Error(`Could not remove files from ${bucket}: ${error.message}`);
    }
    console.log(`${paths.length} files removed from ${bucket}.`);
  }

  const left = (await counts(ref)).filter((row) => row.n > 0);
  if (left.length > 0) {
    throw new Error(`Not empty afterwards: ${left.map((row) => `${row.t} (${row.n})`).join(", ")}`);
  }
  console.log("Every record is gone. People, clients, places and masters are untouched.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
