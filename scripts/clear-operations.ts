/**
 * Clears every record in the Operations tools so the team starts from scratch (founder, 2026-10-23): Indents, Purchase Orders,
 * Inventory, Bills, Budgets, Selections, the Estimator's estimates and Supervisors' records. Setup stays: masters, people and
 * access, approvers, the rate book (labour rates, mixes, materials), work order and checklist templates, the site sequence, and
 * every other tool. Document numbers restart at 1. A PO that raised an item's budgeting rate has the rate put back.
 *
 *   npx tsx scripts/clear-operations.ts --project <ref>            # counts only
 *   npx tsx scripts/clear-operations.ts --project <ref> --commit   # back up, then delete
 *
 * Supervisors' stage progress goes too; re-load the real villas' progress afterwards with scripts/import-site-schedule.ts.
 * PRACTICE DATABASE ONLY (`lib/environment.ts`). It bypasses the guards as wipe-staging-records.ts does — ONE transaction with
 * `session_replication_role = replica`, whole tables only — and refuses if a table it keeps points at one it clears, or if a
 * cleared tool's bucket holds files.
 */
import { DATABASES } from "../lib/environment";
import { backupTables } from "./backup-tables";
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

const CLEARED = [
  // Indents and Purchase Orders
  "indent_lines",
  "indents",
  "indent_counters",
  "purchase_order_lines",
  "purchase_orders",
  "po_counters",
  // Inventory
  "goods_receipt_line_rates",
  "goods_receipt_lines",
  "goods_receipts",
  "grn_counters",
  "stock_batch_movements",
  "stock_issue_lines",
  "stock_issues",
  "iss_counters",
  "stock_adjustments",
  // Bills
  "bill_lines",
  "bill_payments",
  "advance_recoveries",
  "contractor_advances",
  "cash_request_items",
  "cash_requests",
  "bills",
  "bill_counters",
  "labour_contract_lines",
  "labour_contracts",
  "wo_counters",
  // Supervisors
  "issue_requests",
  "labour_logs",
  "site_receipt_confirmation_lines",
  "site_receipt_confirmations",
  "site_checklist_items",
  "site_checklists",
  "site_stage_events",
  "site_stages",
  "site_villas",
  // Estimator: estimates only, the rate book stays
  "estimator_estimate_item_rates",
  "estimator_estimate_line_components",
  "estimator_estimate_line_costs",
  "estimator_estimate_line_measurements",
  "estimator_estimate_takeoff",
  "estimator_reconciliation_approvals",
  "estimator_estimate_lines",
  "estimator_estimates",
  "est_counters",
  // Budgets and Selections
  "budget_lines",
  "budgets",
  "selection_lines",
  "selections",
  "space_views",
  "spaces",
  // Budgeting rates a cleared PO raised: put back first, below
  "item_price_changes",
] as const;

const BUCKETS = ["site-checklists", "design-views"] as const;

const array = (names: readonly string[]) => `array[${names.map(literal).join(", ")}]::text[]`;

async function counts(ref: string) {
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

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  if (ref !== DATABASES.practice) {
    throw new Error(
      `This runs on the practice database (${DATABASES.practice}) only — not ${ref}.`,
    );
  }
  const dangling = await keptPointingAtCleared(ref);
  if (dangling.length > 0) {
    throw new Error(
      `Kept tables point at cleared ones — nothing deleted:\n  ${dangling.join("\n  ")}`,
    );
  }
  const before = await counts(ref);
  const files = before.filter((row) => row.t.startsWith("storage:") && row.n > 0);
  if (files.length > 0) {
    throw new Error(
      `Files to deal with first: ${files.map((row) => `${row.t} (${row.n})`).join(", ")}`,
    );
  }
  const [prices] = await sql<{ n: number }>(
    ref,
    `select count(distinct item_id)::int as n from item_price_changes`,
  );
  console.log(`${ref}: before`);
  console.table(before.filter((row) => row.n > 0));
  console.log(`${prices.n} items get the budgeting rate they had before the first PO raised it.`);

  if (!isCommit(argv)) {
    console.log("Dry run — nothing deleted. Add --commit to back up and delete all of the above.");
    return;
  }

  const dir = await backupTables(ref, "clear-operations", [...CLEARED, "items"]);
  console.log(`Backed up to ${dir}`);
  await sql(
    ref,
    `begin;
     set local session_replication_role = replica;
     update items i set indicative_price = first.old_price
       from (select distinct on (item_id) item_id, old_price from item_price_changes order by item_id, changed_at, id) first
      where i.id = first.item_id;
     ${CLEARED.map((table) => `delete from ${table};`).join("\n     ")}
     commit;`,
  );
  const left = (await counts(ref)).filter((row) => row.n > 0);
  if (left.length > 0) {
    throw new Error(`Not empty afterwards: ${left.map((row) => `${row.t} (${row.n})`).join(", ")}`);
  }
  console.log("Every Operations record is gone. Setup and the other tools are untouched.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
