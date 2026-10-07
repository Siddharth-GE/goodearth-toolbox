/**
 * Clears every record people made in the tools on STAGING, so the team
 * starts again from the final masters workbook. Founder, 2026-10-07:
 * "remove all the current data in the apps as well, clear the whole
 * thing". Run it before scripts/import-masters-workbook.ts.
 *
 * Cleared (CLEARED below): indents, POs, goods in and out, stock, bills,
 * labour, estimates — and the rate book's material recipes, which point
 * at the materials the import replaces — budgets, selections and rooms,
 * Relay runs, drawings and transmittals, Dexter decks, client payment
 * schedules and receipts, business plans, funding, saved reports, item
 * requests, every numbering counter and the audit history; and the files
 * in the Dexter, drawings and room-photo buckets.
 *
 * Kept (KEPT below): people, logins and access, approver lists, clients,
 * the plot register, projects, plots and villas, the design catalogue,
 * Relay's trails, departments, activities and schedules, Chat-space
 * links, Marathon. The masters the workbook replaces are the import's
 * business, not this script's.
 *
 * Every table in the database must be on one list or the other — a table
 * added since this was written stops the run until someone decides which.
 *
 * STAGING ONLY: it refuses any other ref. Production carries real work
 * and has no backups.
 *
 * Before deleting, every row and file it deletes is written to
 * data/backups/ (gitignored), and it refuses if a kept table points at a
 * cleared one.
 *
 * WHY IT BYPASSES THE GUARDS — wipe-drawings.ts's reason. Issued and
 * frozen records refuse deletion through their guard triggers, rightly,
 * for everyday use; a wipe must get past them. The deletes run in ONE
 * transaction with `session_replication_role = replica`, which switches
 * every trigger off for that transaction only (guards, FK checks, audit
 * rows) — so whole tables go, never part of one, and the kept-points-at-
 * cleared check above stands in for the FK checks. Rows first, then
 * files, as the app does it.
 *
 *   npx tsx scripts/wipe-staging-records.ts --project <ref>            # counts only
 *   npx tsx scripts/wipe-staging-records.ts --project <ref> --commit   # back up, then delete
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { backupTables } from "./backup-tables";
import { isCommit, literal, requireProjectRef, serviceRoleKey, sql } from "./supabase-management";

const STAGING = "ipstebqawrvhkyntctrv";

const CLEARED = [
  // Indents → POs → goods in and out → stock → bills
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
  // Budgets
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
  // Selections and rooms
  "selection_lines",
  "selections",
  "space_views",
  "spaces",
  // Design Management
  "transmittal_lines",
  "transmittals",
  "transmittal_counters",
  "drawing_revision_works",
  "drawing_revision_files",
  "drawing_revisions",
  "drawing_set_works",
  "drawing_sets",
  // Relay runs
  "pusher_chain_links",
  "pusher_chain_events",
  "pusher_chain_legs",
  "pusher_chain_departments",
  "pusher_chains",
  // Dexter
  "dexter_answers",
  "dexter_decks",
  "dexter_projects",
  // Client Relations money
  "client_receipts",
  "client_payment_milestones",
  // Business Planning, Financial Management
  "business_plan_targets",
  "business_plans",
  "funding_movements",
  "funding_facilities",
  // Reporter, Masters' item requests, history
  "reports",
  "item_requests",
  "app_errors",
  "audit_log",
] as const;

const KEPT = [
  // The shell: people, sign-in, access
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
  // Clients and places
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
  // Relay's setup, and the Chat door's links
  "project_stages",
  "pusher_activities",
  "pusher_departments",
  "pusher_project_plans",
  "pusher_trail_sets",
  "pusher_trail_set_items",
  "google_chat_spaces",
  // Marathon, the kiosk
  "marathon_agents",
  "marathon_categories",
  "marathon_config",
  "marathon_entries",
  "marathon_groups",
  "marathon_pin_attempts",
  "marathon_runs",
] as const;

const BUCKETS = ["dexter", "drawings", "design-views"] as const;

type Storage = ReturnType<typeof createClient>["storage"];

const array = (names: readonly string[]) => `array[${names.map(literal).join(", ")}]::text[]`;

async function counts(ref: string): Promise<{ t: string; n: number }[]> {
  return sql<{ t: string; n: number }>(
    ref,
    [
      ...CLEARED.map((table) => `select '${table}' as t, count(*)::int as n from ${table}`),
      ...BUCKETS.map(
        (bucket) =>
          `select 'storage: ${bucket}' as t, count(*)::int as n from storage.objects where bucket_id = '${bucket}'`,
      ),
    ].join(" union all "),
  );
}

/** Every public table must be on a list — a new one is a decision, not a default. */
async function unlisted(ref: string): Promise<string[]> {
  const rows = await sql<{ t: string }>(
    ref,
    `select c.relname as t from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relkind in ('r', 'p')
       and not (c.relname = any(${array([...CLEARED, ...KEPT])}))
     order by 1`,
  );
  return rows.map((row) => row.t);
}

/** Rows in a kept table that point at a cleared one — they would be left pointing at nothing. */
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

/** Every object path in a bucket; a folder has no id in the listing. */
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
  if (ref !== STAGING) {
    throw new Error(
      `This clears every record in the tools and runs on staging (${STAGING}) only — not ${ref}.`,
    );
  }

  const missing = await unlisted(ref);
  if (missing.length > 0) {
    throw new Error(
      `Tables on neither list: ${missing.join(", ")}. Decide whether each is a record (CLEARED) or setup (KEPT) first.`,
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

  const dir = await backupTables(ref, "wipe", CLEARED);
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
