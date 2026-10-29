/**
 * Brings the Kaadal Billing sheet's records into Kaadal Billing (0169), once, and places the tool in the
 * Interiors Operations team.
 *
 *   npx tsx scripts/import-kaadal-billing.ts --project <ref> --json <file>            # dry run
 *   npx tsx scripts/import-kaadal-billing.ts --project <ref> --json <file> --commit
 *
 * The file is the sheet's own data ({ vendors, orders, payments }, keyed v01 / o01 / p01). It holds vendors'
 * bank details, so it lives outside the repo (which is public), at ../kaadal-billing-data/. Never commit it.
 *
 * One transaction. Re-runnable: every row's id is md5('kaadal-billing:<key>'), and a vendor already there by
 * name is used as it is, so a second run inserts nothing. Rows carry no created_by (there is no session).
 */
import { readFileSync } from "node:fs";

import { isCommit, requireProjectRef, sql } from "./supabase-management";

type Sheet = {
  vendors: Record<string, { name: string; bank: string }>;
  orders: Record<
    string,
    {
      vendor: string;
      plots: string[];
      gross: number;
      split: Record<string, number>;
      deduction: number;
      deductionPlot: string;
      deductionNote: string;
      item: string;
      payNote: string;
      notes: string;
      orderedOn: string;
      createdAt: string;
    }
  >;
  payments: Record<
    string,
    {
      order: string;
      amount: number;
      date: string;
      by: string;
      type: string;
      plot: string;
      alloc: Record<string, number>;
      ref: string;
      notes: string;
      createdAt: string;
    }
  >;
};

const argv = process.argv.slice(2);
const ref = requireProjectRef(process.argv);
const commit = isCommit(argv);
const at = argv.indexOf("--json");
if (at === -1 || !argv[at + 1]) throw new Error("--json <file> is required: the sheet's records.");
const sheet = JSON.parse(readFileSync(argv[at + 1], "utf8")) as Sheet;

const lit = (s: string) => `'${s.split("'").join("''")}'`;
const orNull = (s: string) => (s ? lit(s) : "null");
const id = (key: string) => `md5(${lit(`kaadal-billing:${key}`)})::uuid`;
const json = (o: unknown) => `${lit(JSON.stringify(o))}::jsonb`;
const num = (n: number) => {
  if (!Number.isFinite(n)) throw new Error(`Not a number: ${n}`);
  return String(Math.round(n * 100) / 100);
};

const statements: string[] = [];
for (const v of Object.values(sheet.vendors)) {
  statements.push(
    `insert into kaadal_billing_vendors (name, bank) select ${lit(v.name.trim())}, ${lit(v.bank.trim())}
     where not exists (select 1 from kaadal_billing_vendors where lower(name) = lower(${lit(v.name.trim())}));`,
  );
}
for (const [key, o] of Object.entries(sheet.orders)) {
  const vendor = sheet.vendors[o.vendor];
  if (!vendor) throw new Error(`${key} names vendor ${o.vendor}, which the file doesn't have.`);
  statements.push(
    `insert into kaadal_billing_orders (id, vendor_id, plots, gross, split, deduction, deduction_plot,
       deduction_note, item, pay_note, notes, ordered_on, created_at)
     select ${id(key)}, v.id, array[${o.plots.map(lit).join(", ")}]::text[], ${num(o.gross)}, ${json(o.split)},
       ${num(o.deduction)}, ${orNull(o.deductionPlot)}, ${lit(o.deductionNote)}, ${lit(o.item)}, ${lit(o.payNote)},
       ${lit(o.notes)}, ${orNull(o.orderedOn)}::date, ${lit(o.createdAt)}::timestamptz
     from kaadal_billing_vendors v where lower(v.name) = lower(${lit(vendor.name.trim())})
     on conflict (id) do nothing;`,
  );
}
for (const [key, p] of Object.entries(sheet.payments)) {
  if (!sheet.orders[p.order])
    throw new Error(`${key} is on order ${p.order}, which the file doesn't have.`);
  // The sheet kept a payment for one plot as `plot`; the toolbox keeps every mark in `alloc`.
  const alloc = Object.keys(p.alloc ?? {}).length ? p.alloc : p.plot ? { [p.plot]: p.amount } : {};
  statements.push(
    `insert into kaadal_billing_payments (id, order_id, amount, paid_on, paid_by, kind, alloc, reference, notes, created_at)
     values (${id(key)}, ${id(p.order)}, ${num(p.amount)}, ${orNull(p.date)}::date, ${lit(p.by)}, ${lit(p.type)},
       ${json(alloc)}, ${lit(p.ref)}, ${lit(p.notes)}, ${lit(p.createdAt)}::timestamptz)
     on conflict (id) do nothing;`,
  );
}
statements.push(
  `insert into tool_team_apps (app, team_id) select '/kaadal-billing', id from tool_teams
   where name = 'Interiors Operations' on conflict (app) do nothing;`,
);

const counts = `(select count(*) from kaadal_billing_vendors) || ' vendors, ' ||
  (select count(*) from kaadal_billing_orders) || ' orders, ' ||
  (select count(*) from kaadal_billing_payments) || ' payments; team: ' ||
  coalesce((select t.name from tool_team_apps a join tool_teams t on t.id = a.team_id where a.app = '/kaadal-billing'), 'Other')`;

void (async () => {
  console.log(
    `File: ${Object.keys(sheet.vendors).length} vendors, ${Object.keys(sheet.orders).length} orders, ${Object.keys(sheet.payments).length} payments.`,
  );
  if (!commit) {
    try {
      await sql(
        ref,
        `begin;\n${statements.join("\n")}\ndo $dry$ begin raise exception 'DRY RUN: would leave %', ${counts}; end $dry$;\nrollback;`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const m = /DRY RUN: would leave ([^\n"]*)/.exec(message);
      console.log(
        m ? `Dry run. Would leave ${m[1]}. Nothing written; --commit to write.` : message,
      );
      process.exit(m ? 0 : 1);
    }
    return;
  }
  await sql(ref, `begin;\n${statements.join("\n")}\ncommit;`);
  const [row] = await sql<{ result: string }>(ref, `select ${counts} as result`);
  console.log(`Written on ${ref}. The tool now holds ${row.result}.`);
})();
