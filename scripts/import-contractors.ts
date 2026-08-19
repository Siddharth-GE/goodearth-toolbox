/**
 * Marks the site team's contractors in the vendors master — Book1.xlsx,
 * "Contractor names" sheet, deduplicated (the sheet lists Rasheed K four
 * times across its two blocks; each person appears here once).
 *
 *   npx tsx scripts/import-contractors.ts --project <ref>            # dry run
 *   npx tsx scripts/import-contractors.ts --project <ref> --commit   # write
 *
 * Contractors are VENDORS — 0025's one-counterparty-list rule — so this
 * writes the vendors table: an existing vendor (matched case-insensitively
 * on the trimmed name) only gets is_contractor set true, nothing else
 * touched; an unknown name is inserted as a new active vendor with the
 * flag. Names stay exactly as the site team types them on bills.
 *
 * The dry run prints near-duplicate suspicions (same words in a different
 * order, or one name contained in another — "SAJU C" / "C SAJU",
 * "Santhosh K" / "K Santhosh", "Rijesh" / "Rijesh K P") for the founder
 * to rule on. Nothing is ever merged automatically.
 *
 * Natural key: lower(trim(name)). A re-run finds everything flagged and
 * writes nothing.
 */
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

const CONTRACTORS: string[] = [
  "PRINTO FRANCIS",
  "Rasheed K",
  "Sivakumar K P",
  "Jitheesh K",
  "Sreejayan",
  "Rijesh",
  "Purushothaman K",
  "Sukumaran P",
  "Linse V",
  "Fathima Naseeba CH",
  "Vinod K",
  "Ratheesh Manoli",
  "Shyju KV",
  "Shyju PV",
  "NIKHIL M ALIYAS",
  "Sajith M",
  "Santhosh K",
  "Pradeepkumar VK",
  "Dipin K",
  "KGN ENGINEERS & CONTRACTORS",
  "Vipil Vayalankara",
  "Prabhakaran M",
  "Prakasan P",
  "Nithul P",
  "Nirmanam Construction Chemicals",
  "Saneesh Kumar MR",
  "Manoharan T M",
  "Sanu Joseph",
  "Pramod Kumar K",
  "Sarath N",
  "Neelima M",
  "Samson Roby",
  "Meera C",
  "Soma Sarkar",
  "Subodh Roy",
  "Sreejith Kumar M",
  "Kaizen Roofings",
  "Sadanandan Puthukudy",
  "K PUSHPAVALLY",
  "PAVITHRAN A",
  "Jinil P",
  "RISHNA CP",
  "SULOCHANA V",
  "SREEJA C",
  "NANDIATH SATHEESAN",
  "VALSALA C",
  "Jobin EJ",
  "Praseetha K",
  "Rajesh K",
  "Suresh Earayi",
  "Sujith M",
  "BALACHANDRAN K R",
  "Babu Kattan",
  "Manoli Babu",
  "K Santhosh",
  "Uccons Engineering LLP",
  "MANU GOPAL",
  "C SAJU",
  "Sajith TK",
  "Mohammad Jabir Ali",
  "SAJU C",
  "Rashid BK",
  "GEPS ENERGY INDIA PVT LTD",
  "Sujith P S",
  "CHANDRI C",
  "ANISHA K",
  "NIJISHA P",
  "Aswanth p",
  "SYAMALA C",
  "SURYAKIRAN K",
  "Madhavi C P",
  "AMJED K",
  "SEENA K",
  "Roja K",
  "Anish Kumar RS",
  "Pankaj Roy",
  "SHEEJA K",
  "Derick Abraham",
  "Sadesh",
  "Sanilkumar A",
  "Narithookkil Gardens",
  "Rijesh K P",
  "Biju PV",
  "Mini KG",
  "Vijesh Parayath",
];

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

type DbVendor = { id: string; name: string; is_contractor: boolean };

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);

  // The transcription itself must be duplicate-free before anything runs.
  const seen = new Map<string, string>();
  for (const name of CONTRACTORS) {
    const previous = seen.get(key(name));
    if (previous) {
      console.error(`Transcription problem: "${name}" duplicates "${previous}". Nothing written.`);
      process.exit(1);
    }
    seen.set(key(name), name);
  }

  console.log(`Database : ${ref}`);
  console.log(`Sheet    : ${CONTRACTORS.length} contractor names (deduplicated)`);
  console.log(`Mode     : ${commit ? "COMMIT" : "dry run"}\n`);

  const vendors = await sql<DbVendor>(ref, "select id, name, is_contractor from vendors");
  const vendorByKey = new Map(vendors.map((v) => [key(v.name), v]));

  const statements: string[] = [];
  let inserted = 0;
  let flagged = 0;
  let unchanged = 0;

  for (const name of CONTRACTORS) {
    const existing = vendorByKey.get(key(name));
    if (!existing) {
      inserted += 1;
      console.log(`  + ${name}  (new vendor, contractor)`);
      statements.push(
        `insert into vendors (name, is_active, is_contractor)
         select ${literal(name.trim())}, true, true
         where not exists (select 1 from vendors where lower(trim(name)) = ${literal(key(name))});`,
      );
    } else if (!existing.is_contractor) {
      flagged += 1;
      console.log(`  ~ ${existing.name}  (existing vendor, marking as contractor)`);
      statements.push(
        `update vendors set is_contractor = true where id = ${literal(existing.id)};`,
      );
    } else {
      unchanged += 1;
      console.log(`  = ${existing.name}`);
    }
  }

  console.log(`\n+ ${inserted} new, ~ ${flagged} marked, = ${unchanged} already contractors`);

  // Near-duplicate report over the whole future list: the sheet's names
  // plus every vendor already in the database.
  const allNames = [
    ...new Map(
      [...CONTRACTORS, ...vendors.map((v) => v.name)].map((name) => [key(name), name.trim()]),
    ).values(),
  ];
  const pairs: string[] = [];
  for (let i = 0; i < allNames.length; i++) {
    for (let j = i + 1; j < allNames.length; j++) {
      if (suspicious(allNames[i], allNames[j])) {
        pairs.push(`"${allNames[i]}"  ↔  "${allNames[j]}"`);
      }
    }
  }
  if (pairs.length > 0) {
    console.log("\nPossibly the same person — review with the founder, never auto-merged:");
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

  const count = await sql<{ n: number }>(
    ref,
    "select count(*)::int as n from vendors where is_contractor",
  );
  console.log(`\nDone. ${count[0].n} vendors now carry the contractor flag.`);
  console.log("Re-run without --commit: every row should print '='.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
