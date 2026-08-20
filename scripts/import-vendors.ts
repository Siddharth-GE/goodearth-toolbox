/**
 * One-off importer for the supplier vendors — Material.xlsx, sheet
 * "Vendor Extract Report" (83 vendors), converted to data/vendors.csv.
 * data/ is gitignored on purpose: 72 of these rows carry bank account
 * numbers, and nothing sensitive ever enters this public repo (the
 * Marathon-PIN lesson). That is also why, unlike import-contractors.ts,
 * the rows are NOT inlined here.
 *
 *   npx tsx scripts/import-vendors.ts --project <ref>            # dry run
 *   npx tsx scripts/import-vendors.ts --project <ref> --commit   # write
 *
 * Contact, GST and payment-term fields land on the vendors master
 * (0089's new columns included). Bank details land in
 * vendor_payment_details, the gated 1:1 table 0089 created — never on
 * the open vendors table.
 *
 * Matching follows import-contractors.ts: lower(trim(name)) is the
 * natural key. An unknown name is inserted as a new active supplier
 * (is_contractor false). A known name — "Linse V" is both a contractor
 * and a supplier here — only has blank detail fields filled in; name,
 * is_active and is_contractor are never touched, and a field the
 * database already has wins over the sheet. Bank details upsert on
 * vendor_id. A re-run finds everything present and writes nothing.
 *
 * The dry run prints near-duplicate suspicions across the sheet plus
 * every vendor already in the database, for the founder to rule on.
 * Nothing is ever merged automatically.
 */
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

const DATA_DIR = resolve(import.meta.dirname, "..", "data");

type CsvVendor = {
  name: string;
  address: string;
  contact_name: string;
  mobile: string;
  designation: string;
  email: string;
  gstin: string;
  gst_state: string;
  bank_name: string;
  account_number: string;
  account_holder_name: string;
  ifsc: string;
  payment_term_days: string;
  creator: string; // AppSheet metadata, ignored
};

type DbVendor = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_designation: string | null;
  mobile: string | null;
  email: string | null;
  gst_no: string | null;
  gst_state: string | null;
  address: string | null;
  payment_term_days: number | null;
  has_bank: boolean;
};

const key = (name: string) => name.trim().toLowerCase();
const tokens = (name: string) => key(name).split(/\s+/).sort();

/** Same words in any order, or every word of one inside the other. */
function suspicious(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.join(" ") === tb.join(" ")) return true;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  return shorter.every((token) => longerSet.has(token));
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function termDays(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`Payment term "${trimmed}" is not a whole number of days. Nothing written.`);
    process.exit(1);
  }
  return n;
}

function readVendors(): CsvVendor[] {
  let text: string;
  try {
    text = readFileSync(resolve(DATA_DIR, "vendors.csv"), "utf8");
  } catch {
    console.error(
      "data/vendors.csv is missing. Convert Material.xlsx first (plan.md step 1) — data/ is gitignored, so the CSV travels outside git.",
    );
    process.exit(1);
  }
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as CsvVendor[];
}

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);

  const sheet = readVendors().filter((v) => v.name.trim());

  // The transcription itself must be duplicate-free before anything runs.
  const seen = new Map<string, string>();
  for (const v of sheet) {
    const previous = seen.get(key(v.name));
    if (previous) {
      console.error(`Sheet problem: "${v.name}" duplicates "${previous}". Nothing written.`);
      process.exit(1);
    }
    seen.set(key(v.name), v.name);
  }

  console.log(`Database : ${ref}`);
  console.log(`Sheet    : ${sheet.length} vendors`);
  console.log(`Mode     : ${commit ? "COMMIT" : "dry run"}\n`);

  const vendors = await sql<DbVendor>(
    ref,
    `select v.id, v.name, v.contact_name, v.contact_designation, v.mobile, v.email,
            v.gst_no, v.gst_state, v.address, v.payment_term_days,
            exists (select 1 from vendor_payment_details d where d.vendor_id = v.id) as has_bank
     from vendors v`,
  );
  const vendorByKey = new Map(vendors.map((v) => [key(v.name), v]));

  const statements: string[] = [];
  let inserted = 0;
  let enriched = 0;
  let unchanged = 0;
  let bankRows = 0;

  for (const row of sheet) {
    const details = {
      contact_name: orNull(row.contact_name),
      contact_designation: orNull(row.designation),
      mobile: orNull(row.mobile),
      email: orNull(row.email),
      gst_no: orNull(row.gstin),
      gst_state: orNull(row.gst_state),
      address: orNull(row.address),
      payment_term_days: termDays(row.payment_term_days),
    };
    const bank = {
      bank_name: orNull(row.bank_name),
      account_number: orNull(row.account_number),
      account_holder_name: orNull(row.account_holder_name),
      ifsc: orNull(row.ifsc),
    };
    const hasBank = Object.values(bank).some((v) => v !== null);

    const existing = vendorByKey.get(key(row.name));
    if (!existing) {
      inserted += 1;
      console.log(`  + ${row.name.trim()}${hasBank ? "  (with bank details)" : ""}`);
      statements.push(
        `insert into vendors (name, contact_name, contact_designation, mobile, email,
                              gst_no, gst_state, address, payment_term_days,
                              is_active, is_contractor)
         select r.name, r.contact_name, r.contact_designation, r.mobile, r.email,
                r.gst_no, r.gst_state, r.address, r.payment_term_days, true, false
         from jsonb_populate_recordset(
           null::record,
           ${literal(JSON.stringify([{ name: row.name.trim(), ...details }]))}::jsonb
         ) as r(name text, contact_name text, contact_designation text, mobile text,
                email text, gst_no text, gst_state text, address text, payment_term_days int)
         where not exists (select 1 from vendors where lower(trim(name)) = ${literal(key(row.name))});`,
      );
      if (hasBank) {
        bankRows += 1;
        statements.push(
          `insert into vendor_payment_details (vendor_id, bank_name, account_number, account_holder_name, ifsc)
           select v.id, r.bank_name, r.account_number, r.account_holder_name, r.ifsc
           from vendors v,
             jsonb_populate_recordset(
               null::record,
               ${literal(JSON.stringify([bank]))}::jsonb
             ) as r(bank_name text, account_number text, account_holder_name text, ifsc text)
           where lower(trim(v.name)) = ${literal(key(row.name))}
           on conflict (vendor_id) do nothing;`,
        );
      }
      continue;
    }

    // Known vendor: fill blanks only — what the database has, it keeps.
    const fills = (Object.keys(details) as (keyof typeof details)[]).filter(
      (k) => details[k] !== null && existing[k] === null,
    );
    const wantsBank = hasBank && !existing.has_bank;
    if (fills.length === 0 && !wantsBank) {
      unchanged += 1;
      console.log(`  = ${existing.name}`);
      continue;
    }
    enriched += 1;
    console.log(
      `  ~ ${existing.name}  (filling ${[...fills, ...(wantsBank ? ["bank details"] : [])].join(", ")})`,
    );
    if (fills.length > 0) {
      statements.push(
        `update vendors v set ${fills
          .map((k) =>
            k === "payment_term_days"
              ? `${k} = ${details[k]}`
              : `${k} = ${literal(String(details[k]))}`,
          )
          .join(", ")}
         where v.id = ${literal(existing.id)};`,
      );
    }
    if (wantsBank) {
      bankRows += 1;
      statements.push(
        `insert into vendor_payment_details (vendor_id, bank_name, account_number, account_holder_name, ifsc)
         select ${literal(existing.id)}, r.bank_name, r.account_number, r.account_holder_name, r.ifsc
         from jsonb_populate_recordset(
           null::record,
           ${literal(JSON.stringify([bank]))}::jsonb
         ) as r(bank_name text, account_number text, account_holder_name text, ifsc text)
         on conflict (vendor_id) do nothing;`,
      );
    }
  }

  console.log(
    `\n+ ${inserted} new suppliers, ~ ${enriched} existing vendors enriched, = ${unchanged} already complete, ${bankRows} bank-detail rows`,
  );

  // Near-duplicate report over the whole future list.
  const allNames = [
    ...new Map(
      [...sheet.map((v) => v.name), ...vendors.map((v) => v.name)].map((name) => [
        key(name),
        name.trim(),
      ]),
    ).values(),
  ];
  const pairs: string[] = [];
  for (let i = 0; i < allNames.length; i++) {
    for (let j = i + 1; j < allNames.length; j++) {
      if (suspicious(allNames[i], allNames[j])) {
        pairs.push(`"${allNames[i]}"  <->  "${allNames[j]}"`);
      }
    }
  }
  if (pairs.length > 0) {
    console.log("\nPossibly the same party — review with the founder, never auto-merged:");
    for (const pair of pairs) console.log(`  ? ${pair}`);
  }

  if (!commit) {
    console.log("\nDry run — nothing written. Re-run with --commit to apply.");
    return;
  }
  if (statements.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  await sql(ref, `begin;\n${statements.join("\n")}\ncommit;`);

  const counts = await sql<{ suppliers: number; bank: number }>(
    ref,
    `select
       (select count(*)::int from vendors where not is_contractor) as suppliers,
       (select count(*)::int from vendor_payment_details) as bank`,
  );
  console.log(
    `\nDone. ${counts[0].suppliers} suppliers in the vendors master, ${counts[0].bank} with bank details.`,
  );
  console.log("Re-run without --commit: every row should print '='.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
