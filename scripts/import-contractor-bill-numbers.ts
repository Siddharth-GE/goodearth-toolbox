/**
 * Loads the founder's contractors sheet (one tab per company: DEVELOPMENTS, FUTURES, PROJECTS, each "CONTRACTOR" and
 * "FINAL BILLNO") into contractor_bill_numbers (0164): each contractor's last paper bill number per company, so the
 * toolbox's first bill takes the next. Also gives the three companies their codes ED, EF, EP where they have none.
 *
 *   npx tsx scripts/import-contractor-bill-numbers.ts --project <ref> --xlsx <path>            # dry run
 *   npx tsx scripts/import-contractor-bill-numbers.ts --project <ref> --xlsx <path> --commit
 *
 * Only the number after the last dash is read; the sheet's old codes are not kept (one code per contractor, founder
 * 2026-10-27). A name matches a contractor when its letters are the same, else when one is the start of the other and
 * no other contractor fits — a loose match is only listed unless --loose is given. A count the toolbox is already
 * keeping is never touched. A re-run writes nothing new.
 */
import { backupTables } from "./backup-tables";
import { readWorkbook } from "./read-xlsx";
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

const SHEETS = [
  { sheet: "DEVELOPMENTS", code: "ED", company: /developments/i },
  { sheet: "FUTURES", code: "EF", company: /futures/i },
  { sheet: "PROJECTS", code: "EP", company: /projects/i },
] as const;

type Contractor = { id: string; name: string };
type Company = { id: string; name: string; code: string | null };

/** "Nithul P(Disa)" → "nithulp": letters only, a bracketed nickname dropped. */
const letters = (name: string) =>
  name
    .replace(/\([^)]*\)?/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** "LAKI-SV-PW-O1" → 1: the last part, a letter O read as a zero. */
function lastNumber(billNo: string): number | null {
  const tail = billNo.trim().split("-").pop()?.replace(/[oO]/g, "0") ?? "";
  return /^\d+$/.test(tail) ? Number(tail) : null;
}

function matchName(
  name: string,
  contractors: Contractor[],
): { contractor: Contractor; loose: boolean } | string {
  const key = letters(name);
  const exact = contractors.filter((c) => letters(c.name) === key);
  if (exact.length === 1) return { contractor: exact[0], loose: false };
  if (exact.length > 1) return `same letters as ${exact.map((c) => c.name).join(", ")}`;
  const loose = contractors.filter((c) => {
    const other = letters(c.name);
    return key.length >= 4 && other.length >= 4 && (other.startsWith(key) || key.startsWith(other));
  });
  if (loose.length === 1) return { contractor: loose[0], loose: true };
  return loose.length > 1
    ? `could be ${loose.map((c) => c.name).join(", ")}`
    : "no contractor by that name";
}

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const at = argv.indexOf("--xlsx");
  if (at === -1 || !argv[at + 1])
    throw new Error("--xlsx <path to the contractors sheet> is required.");
  const workbook = readWorkbook(argv[at + 1]);
  const takeLoose = argv.includes("--loose");

  const contractors = await sql<Contractor>(
    ref,
    "select id, name from vendors where is_contractor order by name",
  );
  const companies = await sql<Company>(ref, "select id, name, code from companies order by name");
  const counted = new Set(
    (
      await sql<{ vendor_id: string; company_id: string }>(
        ref,
        "select vendor_id, company_id from contractor_bill_numbers where app_numbering",
      )
    ).map((row) => `${row.vendor_id}/${row.company_id}`),
  );

  const writes = new Map<string, { vendorId: string; companyId: string; lastNo: number }>();
  const codes: { id: string; code: string }[] = [];
  const loose: string[] = [];
  const unmatched: string[] = [];
  const skipped: string[] = [];

  for (const { sheet, code, company: pattern } of SHEETS) {
    const rows = workbook.get(sheet);
    if (!rows) throw new Error(`The workbook has no ${sheet} tab.`);
    const fits = companies.filter((c) => pattern.test(c.name));
    if (fits.length !== 1) {
      throw new Error(
        `${sheet}: expected one company named like ${pattern}, found ${fits.length}.`,
      );
    }
    const company = fits[0];
    if (!company.code) codes.push({ id: company.id, code });
    else if (company.code !== code) {
      console.log(`${sheet}: ${company.name} already has the code ${company.code}; left as it is.`);
    }

    for (const row of rows.slice(1)) {
      const [name = "", billNo = ""] = row.cells.map((cell) => (cell ?? "").trim());
      if (!name) continue;
      const lastNo = lastNumber(billNo);
      if (lastNo === null) {
        unmatched.push(`${sheet} row ${row.row}: ${name} — "${billNo}" ends in no number`);
        continue;
      }
      const match = matchName(name, contractors);
      if (typeof match === "string") {
        unmatched.push(`${sheet} row ${row.row}: ${name} (${billNo}) — ${match}`);
        continue;
      }
      if (match.loose) {
        loose.push(`${sheet}: "${name}" (${lastNo}) could be ${match.contractor.name}`);
        if (!takeLoose) continue;
      }
      const key = `${match.contractor.id}/${company.id}`;
      if (counted.has(key)) {
        skipped.push(`${sheet}: ${match.contractor.name} — the toolbox is already counting`);
        continue;
      }
      const prior = writes.get(key);
      if (!prior || prior.lastNo < lastNo) {
        writes.set(key, { vendorId: match.contractor.id, companyId: company.id, lastNo });
      }
    }
  }

  console.log(
    `\n${writes.size} last bill numbers to set; company codes to give: ${codes.map((c) => c.code).join(", ") || "none"}.`,
  );
  if (loose.length) {
    const fate = takeLoose ? "set" : "not set without --loose";
    console.log(`\nMatched loosely, ${fate}:\n  ${loose.join("\n  ")}`);
  }
  if (unmatched.length) console.log(`\nNot matched, so not set:\n  ${unmatched.join("\n  ")}`);
  if (skipped.length) console.log(`\nLeft alone:\n  ${skipped.join("\n  ")}`);

  if (!isCommit(argv)) {
    console.log("\nDry run: nothing written. Add --commit to write.");
    return;
  }

  const dir = await backupTables(ref, "contractor-bill-numbers", [
    "companies",
    "contractor_bill_numbers",
  ]);
  console.log(`Backed up to ${dir}`);
  const rows = [...writes.values()];
  await sql(
    ref,
    `begin;
     ${codes.map((c) => `update companies set code = ${literal(c.code)} where id = ${literal(c.id)} and code is null;`).join("\n")}
     ${
       rows.length
         ? `insert into contractor_bill_numbers (vendor_id, company_id, last_no)
            select r.vendor_id, r.company_id, r.last_no
              from jsonb_to_recordset(${literal(JSON.stringify(rows.map((r) => ({ vendor_id: r.vendorId, company_id: r.companyId, last_no: r.lastNo }))))}::jsonb)
                as r(vendor_id uuid, company_id uuid, last_no int)
            on conflict (vendor_id, company_id) do update set last_no = excluded.last_no
            where not contractor_bill_numbers.app_numbering;`
         : ""
     }
     commit;`,
  );
  console.log("Written.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
