/**
 * Loads the founder's final masters workbook into one database: vendors
 * and contractors (bank details into the gated vendor_payment_details),
 * works and their labour rates (the Estimator's rate book), material
 * categories, materials and construction stages. What the workbook no
 * longer lists is removed — founder, 2026-10-07: "this is the final
 * data". The cleaning rules and the decisions behind them are
 * lib/masters/masters-workbook.ts; this file reads and writes.
 *
 *   npx tsx scripts/import-masters-workbook.ts --project <ref> --xlsx <path>            # dry run
 *   npx tsx scripts/import-masters-workbook.ts --project <ref> --xlsx <path> --commit   # write
 *
 * The workbook is read where it lies and never copied into the repo: 76
 * of its vendors carry bank account numbers.
 *
 * MATCHING. Vendors on their name — exactly (any spelling the sheet used),
 * then ignoring case and punctuation where that picks out one vendor on
 * each side ("ELOR LIGHTING PVT LTD" is "Elor Lighting Pvt. Ltd.") — so a
 * vendor keeps its id and takes the sheet's spelling. A blank in the sheet
 * keeps what the database has, payment terms above all: the sheet has no
 * column for them and the founder kept the 10-day terms. Works and
 * materials match on their code, categories and stages on their name.
 *
 * REMOVING. Run scripts/wipe-staging-records.ts first; after it nothing
 * points at the old masters. If something still does, this stops and says
 * what before writing anything — the line chain refuses deletion, it never
 * cascades (CLAUDE.md).
 *
 * Everything lands in one transaction that ends by checking the counts. A
 * re-run finds everything in place and writes nothing. --commit first
 * writes the tables it changes to data/backups/ (gitignored).
 */
import { strFromU8, unzipSync } from "fflate";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  type SheetRow,
  type BankDetails,
  VENDOR_DETAILS,
  type WorkbookVendor,
  looseKey,
  materialCategoriesFromSheet,
  materialsFromSheet,
  stagesFromSheet,
  vendorsFromSheet,
  worksFromSheet,
} from "../lib/masters/masters-workbook";
import { backupTables } from "./backup-tables";
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

const TOUCHED = [
  "vendors",
  "vendor_payment_details",
  "items",
  "item_categories",
  "construction_stages",
  "uoms",
  "work_categories",
  "work_groups",
  "work_items",
  "estimator_work_info",
] as const;

// ---------------------------------------------------------------------------
// Reading the workbook — an .xlsx is a zip of XML parts (fflate is already
// a dependency, for Dexter).
// ---------------------------------------------------------------------------

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

const textRuns = (fragment: string) =>
  unescapeXml([...fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

const columnIndex = (letters: string) =>
  [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function readWorkbook(path: string): Map<string, SheetRow[]> {
  const parts = unzipSync(new Uint8Array(readFileSync(path)));
  const xml = (name: string) => {
    const part = parts[name];
    if (!part) throw new Error(`${path} has no ${name} — is it an .xlsx?`);
    return strFromU8(part);
  };
  const shared = parts["xl/sharedStrings.xml"]
    ? [...xml("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]))
    : [];
  const targets = new Map<string, string>();
  for (const m of xml("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }

  const sheets = new Map<string, SheetRow[]>();
  for (const m of xml("xl/workbook.xml").matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = unescapeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? "").trim();
    const target = targets.get(/\br:id="([^"]+)"/.exec(m[1])?.[1] ?? "");
    if (!target) continue;
    const rows: SheetRow[] = [];
    for (const row of xml(target).matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: (string | undefined)[] = [];
      for (const cell of row[2].matchAll(
        /<c\b[^>]*\br="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const type = /\bt="([^"]+)"/.exec(cell[2])?.[1];
        const inner = cell[3] ?? "";
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value: string | undefined;
        if (type === "s" && raw !== undefined) value = shared[Number(raw)];
        else if (type === "inlineStr") value = textRuns(inner);
        else if (raw !== undefined) value = unescapeXml(raw);
        if (value !== undefined) cells[columnIndex(cell[1])] = value;
      }
      if (cells.length > 0) rows.push({ row: Number(row[1]), cells });
    }
    sheets.set(name, rows);
  }
  return sheets;
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

const lit = (value: string | number | boolean | null): string =>
  value === null ? "null" : typeof value === "string" ? literal(value) : String(value);

const textArray = (values: readonly string[]) => `array[${values.map(literal).join(", ")}]::text[]`;

/** Rows as JSON for jsonb_populate_recordset — Postgres does every type conversion (clone-data.ts's rule). */
const recordset = (rows: object[], columns: string) =>
  `jsonb_populate_recordset(null::record, ${literal(JSON.stringify(rows))}::jsonb) as r(${columns})`;

/**
 * What still points at rows about to be deleted, from tables this script
 * does not itself clean up. Self-references from rows also being deleted
 * don't count.
 */
async function blockers(
  ref: string,
  table: string,
  doomed: string,
  handled: string[] = [],
): Promise<string[]> {
  const fks = await sql<{ child: string; cols: string[]; parentcols: string[] }>(
    ref,
    `select c.conrelid::regclass::text as child,
            array(select a.attname::text from unnest(c.conkey) with ordinality k(n, i)
                  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.i) as cols,
            array(select a.attname::text from unnest(c.confkey) with ordinality k(n, i)
                  join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.i) as parentcols
     from pg_constraint c
     where c.contype = 'f' and c.confrelid = '${table}'::regclass`,
  );
  const checks = fks
    .filter((fk) => !handled.includes(fk.child))
    .map(
      (fk) =>
        `select '${fk.child}.${fk.cols.join(",")}' as ref, count(*)::int as n from ${fk.child} ch
         where (${fk.cols.map((c) => `ch.${c}`).join(", ")}) in (select ${fk.parentcols.join(", ")} from ${table} where ${doomed})
         ${fk.child === table ? `and ch.id not in (select id from ${table} where ${doomed})` : ""}`,
    );
  if (checks.length === 0) return [];
  const found = await sql<{ ref: string; n: number }>(ref, checks.join(" union all "));
  return found.filter((row) => row.n > 0).map((row) => `${table} ← ${row.ref}: ${row.n} rows`);
}

// ---------------------------------------------------------------------------

type DbVendor = {
  id: string;
  name: string;
  is_active: boolean;
  is_contractor: boolean;
  payment_term_days: number | null;
  bank: BankDetails | null;
} & Record<(typeof VENDOR_DETAILS)[number], string | null>;

/** Each sheet vendor's database row, if it has one — see MATCHING above. */
function matchVendors(sheet: WorkbookVendor[], db: DbVendor[]): Map<WorkbookVendor, DbVendor> {
  const matched = new Map<WorkbookVendor, DbVendor>();
  const taken = new Set<string>();
  const exact = new Map(db.map((v) => [v.name.trim().toLowerCase(), v]));
  for (const vendor of sheet) {
    for (const name of [vendor.name, ...vendor.sheetNames]) {
      const hit = exact.get(name.toLowerCase());
      if (hit && !taken.has(hit.id)) {
        matched.set(vendor, hit);
        taken.add(hit.id);
        break;
      }
    }
  }
  const keysOf = (v: WorkbookVendor) => new Set([v.name, ...v.sheetNames].map(looseKey));
  const open = sheet.filter((v) => !matched.has(v));
  for (const vendor of open) {
    const keys = keysOf(vendor);
    const candidates = db.filter((v) => !taken.has(v.id) && keys.has(looseKey(v.name)));
    const rivals = open.filter(
      (other) => other !== vendor && [...keysOf(other)].some((k) => keys.has(k)),
    );
    if (candidates.length === 1 && rivals.length === 0) {
      matched.set(vendor, candidates[0]);
      taken.add(candidates[0].id);
    }
  }
  return matched;
}

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);
  const xlsxAt = argv.indexOf("--xlsx");
  const xlsxPath = xlsxAt === -1 ? undefined : argv[xlsxAt + 1];
  if (!xlsxPath || xlsxPath.startsWith("--"))
    throw new Error("--xlsx <path to Masters.xlsx> is required.");

  const workbook = readWorkbook(xlsxPath);
  const sheet = (name: string) => {
    const rows = workbook.get(name);
    if (!rows) throw new Error(`The workbook has no "${name}" sheet.`);
    return rows;
  };
  const { vendors, notes: vendorNotes } = vendorsFromSheet(sheet("Vendor & Contractor Names"));
  const works = worksFromSheet(sheet("Works"));
  const materialCategories = materialCategoriesFromSheet(sheet("Category"));
  const { materials, notes: materialNotes } = materialsFromSheet(
    sheet("Material Master"),
    materialCategories,
  );
  const stages = stagesFromSheet(sheet("Stages"));

  console.log(`Database : ${ref}`);
  console.log(`Workbook : ${xlsxPath}`);
  console.log(`Mode     : ${commit ? "COMMIT" : "dry run"}\n`);
  console.log(
    `The workbook: ${vendors.length} vendors (${vendors.filter((v) => v.is_contractor).length} contractors), ` +
      `${works.categories.length} work categories, ${works.groups.length} groups, ${works.items.length} works ` +
      `(${works.items.filter((w) => w.uom).length} in the rate book), ${materialCategories.length} material categories, ` +
      `${materials.length} materials, ${stages.length} stages.\n`,
  );
  console.log("What the cleaning decided:");
  for (const note of [
    ...vendorNotes.filter((n) => !n.includes(" times (rows")),
    ...works.notes,
    ...materialNotes,
  ]) {
    console.log(`  · ${note}`);
  }
  const repeats = vendorNotes.filter((n) => n.includes(" times (rows")).length;
  console.log(`  · ${repeats} vendor names the sheet repeats are one vendor each.\n`);

  // --- What the database has ------------------------------------------------
  const [
    uoms,
    categoriesDb,
    itemsDb,
    stagesDb,
    vendorsDb,
    workCatsDb,
    groupsDb,
    workItemsDb,
    rateBookDb,
  ] = await Promise.all([
    sql<{ name: string; sort_order: number }>(ref, `select name, sort_order from uoms`),
    sql<{ id: string; name: string; kind: string; is_active: boolean }>(
      ref,
      `select id, name, kind, is_active from item_categories`,
    ),
    sql<{
      id: string;
      code: string | null;
      kind: string;
      name: string;
      description: string | null;
      category: string;
      default_uom: string;
      indicative_price: number | null;
      is_active: boolean;
    }>(
      ref,
      `select i.id, i.code, i.kind, i.name, i.description, c.name as category, i.default_uom,
                i.indicative_price::float8 as indicative_price, i.is_active
         from items i join item_categories c on c.id = i.category_id`,
    ),
    sql<{ name: string; sort_order: number; is_active: boolean }>(
      ref,
      `select name, sort_order, is_active from construction_stages`,
    ),
    sql<DbVendor>(
      ref,
      `select v.id, v.name, v.is_active, v.is_contractor, v.payment_term_days,
                v.contact_name, v.contact_designation, v.mobile, v.email, v.gst_no, v.gst_state, v.address,
                case when d.vendor_id is null then null else json_build_object(
                  'bank_name', d.bank_name, 'account_number', d.account_number,
                  'account_holder_name', d.account_holder_name, 'ifsc', d.ifsc) end as bank
         from vendors v left join vendor_payment_details d on d.vendor_id = v.id`,
    ),
    sql<{ code: string; name: string; sort_order: number; is_active: boolean }>(
      ref,
      `select code, name, sort_order, is_active from work_categories`,
    ),
    sql<{ code: string; category: string; name: string; sort_order: number; is_active: boolean }>(
      ref,
      `select g.code, c.code as category, g.name, g.sort_order, g.is_active
         from work_groups g join work_categories c on c.id = g.category_id`,
    ),
    sql<{
      code: string;
      category: string;
      group: string | null;
      name: string;
      sort_order: number;
      is_active: boolean;
    }>(
      ref,
      `select w.code, c.code as category, g.code as "group", w.name, w.sort_order, w.is_active
         from work_items w join work_categories c on c.id = w.category_id
         left join work_groups g on g.id = w.group_id`,
    ),
    sql<{ code: string; uom: string; labour_rate: number | null }>(
      ref,
      `select w.code, r.uom, r.labour_rate::float8 as labour_rate
         from estimator_work_info r join work_items w on w.id = r.work_item_id`,
    ),
  ]);

  const statements: string[] = [];
  const report: string[] = [];
  const say = (line: string) => report.push(line);

  // --- Units ------------------------------------------------------------------
  const haveUoms = new Set(uoms.map((u) => u.name));
  const wantUoms = [
    ...new Set([
      ...materials.map((m) => m.uom),
      ...works.items.flatMap((w) => (w.uom ? [w.uom] : [])),
    ]),
  ];
  const newUoms = wantUoms.filter((u) => !haveUoms.has(u));
  let nextUomOrder = Math.max(0, ...uoms.map((u) => u.sort_order));
  if (newUoms.length > 0) {
    say(`Units: + ${newUoms.join(", ")}`);
    statements.push(
      `insert into uoms (name, sort_order, is_active) values ${newUoms
        .map((name) => `(${literal(name)}, ${(nextUomOrder += 10)}, true)`)
        .join(", ")};`,
    );
  }

  // --- Construction stages ------------------------------------------------------
  const stageByKey = new Map(stagesDb.map((s) => [s.name.toLowerCase(), s]));
  const stageWant = stages.map((name, i) => ({ name, sort_order: (i + 1) * 10 }));
  const stageNew = stageWant.filter((s) => !stageByKey.has(s.name.toLowerCase()));
  const stageChanged = stageWant.filter((s) => {
    const db = stageByKey.get(s.name.toLowerCase());
    return db && (db.name !== s.name || db.sort_order !== s.sort_order || !db.is_active);
  });
  const stageGone = stagesDb.filter(
    (s) => !stages.some((n) => n.toLowerCase() === s.name.toLowerCase()),
  );
  const stageGoneWhere = `lower(name) <> all(${textArray(stages.map((s) => s.toLowerCase()))})`;
  if (stageNew.length + stageChanged.length + stageGone.length > 0) {
    say(
      `Stages: + ${stageNew.map((s) => s.name).join(", ") || "none"}; ~ ${stageChanged.length}; − ${stageGone.map((s) => s.name).join(", ") || "none"}`,
    );
  }
  for (const s of stageNew) {
    statements.push(
      `insert into construction_stages (name, sort_order, is_active) values (${literal(s.name)}, ${s.sort_order}, true);`,
    );
  }
  for (const s of stageChanged) {
    statements.push(
      `update construction_stages set name = ${literal(s.name)}, sort_order = ${s.sort_order}, is_active = true
       where lower(name) = ${literal(s.name.toLowerCase())};`,
    );
  }

  // --- Material categories ------------------------------------------------------
  const catByKey = new Map(categoriesDb.map((c) => [c.name.toLowerCase(), c]));
  for (const c of materialCategories) {
    if (catByKey.get(c.name.toLowerCase())?.kind === "catalogue") {
      throw new Error(
        `"${c.name}" is already a catalogue category — a material category cannot share its name.`,
      );
    }
  }
  const catNew = materialCategories.filter((c) => !catByKey.has(c.name.toLowerCase()));
  const catChanged = materialCategories.filter((c) => {
    const db = catByKey.get(c.name.toLowerCase());
    return db && (db.name !== c.name || !db.is_active);
  });
  const catGone = categoriesDb.filter(
    (c) =>
      c.kind === "material" &&
      !materialCategories.some((m) => m.name.toLowerCase() === c.name.toLowerCase()),
  );
  const catGoneWhere = `kind = 'material' and lower(name) <> all(${textArray(materialCategories.map((c) => c.name.toLowerCase()))})`;
  if (catNew.length + catChanged.length + catGone.length > 0) {
    say(
      `Material categories: + ${catNew.map((c) => c.name).join(", ") || "none"}; ~ ${catChanged.length}; − ${catGone.map((c) => c.name).join(", ") || "none"}`,
    );
  }
  for (const c of catNew) {
    statements.push(
      `insert into item_categories (name, kind, is_active) values (${literal(c.name)}, 'material', true);`,
    );
  }
  for (const c of catChanged) {
    statements.push(
      `update item_categories set name = ${literal(c.name)}, is_active = true where lower(name) = ${literal(c.name.toLowerCase())};`,
    );
  }

  // --- Materials ----------------------------------------------------------------
  const itemByCode = new Map(itemsDb.filter((i) => i.code).map((i) => [i.code as string, i]));
  for (const m of materials) {
    if (itemByCode.get(m.code)?.kind === "catalogue") {
      throw new Error(`${m.code} is already a catalogue item's code.`);
    }
  }
  const matNew = materials.filter((m) => !itemByCode.has(m.code));
  const matChanged = materials.filter((m) => {
    const db = itemByCode.get(m.code);
    return (
      db &&
      (db.name !== m.name ||
        db.description !== null ||
        db.category.toLowerCase() !== m.category.toLowerCase() ||
        db.default_uom !== m.uom ||
        db.indicative_price !== m.indicative_price ||
        !db.is_active)
    );
  });
  const matCodes = new Set(materials.map((m) => m.code));
  const matGone = itemsDb.filter(
    (i) => i.kind === "material" && (i.code === null || !matCodes.has(i.code)),
  );
  const matGoneWhere = `kind = 'material' and (code is null or code <> all(${textArray(materials.map((m) => m.code))}))`;
  if (matNew.length + matChanged.length + matGone.length > 0) {
    say(
      `Materials: + ${matNew.length} new, ~ ${matChanged.length} changed, − ${matGone.length} no longer listed`,
    );
  }
  const matColumns = "code text, name text, category text, uom text, price numeric";
  const matRows = (list: typeof materials) =>
    list.map((m) => ({
      code: m.code,
      name: m.name,
      category: m.category,
      uom: m.uom,
      price: m.indicative_price,
    }));
  if (matChanged.length > 0) {
    statements.push(
      `update items i set name = r.name, description = null, category_id = c.id, default_uom = r.uom,
              indicative_price = r.price, is_active = true
       from ${recordset(matRows(matChanged), matColumns)}
       join item_categories c on lower(c.name) = lower(r.category) and c.kind = 'material'
       where i.code = r.code and i.kind = 'material';`,
    );
  }
  if (matNew.length > 0) {
    statements.push(
      `insert into items (code, name, kind, category_id, default_uom, indicative_price, is_active, is_provisional)
       select r.code, r.name, 'material', c.id, r.uom, r.price, true, false
       from ${recordset(matRows(matNew), matColumns)}
       join item_categories c on lower(c.name) = lower(r.category) and c.kind = 'material';`,
    );
  }
  if (matGone.length > 0) statements.push(`delete from items where ${matGoneWhere};`);
  if (catGone.length > 0) statements.push(`delete from item_categories where ${catGoneWhere};`);
  if (stageGone.length > 0)
    statements.push(`delete from construction_stages where ${stageGoneWhere};`);

  // --- Vendors ------------------------------------------------------------------
  const matched = matchVendors(vendors, vendorsDb);
  const vendorNew = vendors.filter((v) => !matched.has(v));
  const vendorGone = vendorsDb.filter((v) => ![...matched.values()].includes(v));
  let vendorChanged = 0;
  let bankWrites = 0;
  const bankStatement = (id: string, bank: BankDetails) =>
    `insert into vendor_payment_details (vendor_id, bank_name, account_number, account_holder_name, ifsc)
     values (${literal(id)}, ${lit(bank.bank_name)}, ${lit(bank.account_number)}, ${lit(bank.account_holder_name)}, ${lit(bank.ifsc)})
     on conflict (vendor_id) do update set bank_name = excluded.bank_name, account_number = excluded.account_number,
       account_holder_name = excluded.account_holder_name, ifsc = excluded.ifsc;`;

  for (const [vendor, db] of matched) {
    const sets: string[] = [];
    if (db.name !== vendor.name) sets.push(`name = ${literal(vendor.name)}`);
    if (!db.is_active) sets.push("is_active = true");
    if (db.is_contractor !== vendor.is_contractor)
      sets.push(`is_contractor = ${vendor.is_contractor}`);
    for (const field of VENDOR_DETAILS) {
      // A blank in the sheet keeps what the database has.
      if (vendor[field] !== null && db[field] !== vendor[field])
        sets.push(`${field} = ${literal(vendor[field])}`);
    }
    if (sets.length > 0) {
      vendorChanged += 1;
      statements.push(`update vendors set ${sets.join(", ")} where id = ${literal(db.id)};`);
    }
    if (vendor.bank && JSON.stringify(vendor.bank) !== JSON.stringify(db.bank)) {
      bankWrites += 1;
      statements.push(bankStatement(db.id, vendor.bank));
    }
  }
  for (const vendor of vendorNew) {
    const id = randomUUID();
    statements.push(
      `insert into vendors (id, name, is_active, is_contractor, ${VENDOR_DETAILS.join(", ")})
       values (${literal(id)}, ${literal(vendor.name)}, true, ${vendor.is_contractor}, ${VENDOR_DETAILS.map((f) => lit(vendor[f])).join(", ")});`,
    );
    if (vendor.bank) {
      bankWrites += 1;
      statements.push(bankStatement(id, vendor.bank));
    }
  }
  const vendorGoneIds = vendorGone.map((v) => literal(v.id)).join(", ");
  const vendorGoneWhere = vendorGone.length > 0 ? `id in (${vendorGoneIds})` : "false";
  if (vendorGone.length > 0) {
    statements.push(`delete from vendor_payment_details where vendor_id in (${vendorGoneIds});`);
    statements.push(`delete from vendors where ${vendorGoneWhere};`);
  }
  if (vendorNew.length + vendorChanged + vendorGone.length + bankWrites > 0) {
    say(
      `Vendors: + ${vendorNew.length} new, ~ ${vendorChanged} changed, − ${vendorGone.length} no longer listed, ${bankWrites} bank details written`,
    );
    for (const [vendor, db] of matched) {
      if (db.name !== vendor.name) say(`    ~ "${db.name}" is now "${vendor.name}"`);
    }
    for (const vendor of vendorNew)
      say(`    + ${vendor.name}${vendor.is_contractor ? "  [contractor]" : ""}`);
    for (const v of vendorGone) {
      const kept = [
        v.is_contractor && "contractor",
        v.bank && "bank details",
        v.gst_no && "GST",
        v.payment_term_days && `${v.payment_term_days}-day terms`,
      ]
        .filter(Boolean)
        .join(", ");
      say(`    − ${v.name}${kept ? `  [${kept}]` : ""}`);
    }
  }

  // --- Works and the rate book --------------------------------------------------
  const wantCodes = {
    categories: works.categories.map((c) => c.code),
    groups: works.groups.map((g) => g.code),
    items: works.items.map((w) => w.code),
  };
  const workCatByCode = new Map(workCatsDb.map((c) => [c.code, c]));
  const groupByCode = new Map(groupsDb.map((g) => [g.code, g]));
  const workByCode = new Map(workItemsDb.map((w) => [w.code, w]));
  const rateByCode = new Map(rateBookDb.map((r) => [r.code, r]));

  for (const g of works.groups) {
    const db = groupByCode.get(g.code);
    if (db && db.category !== g.category) {
      throw new Error(
        `Group ${g.code} moves from ${db.category} to ${g.category} — not handled; move it in Masters first.`,
      );
    }
  }

  const workGone = workItemsDb.filter((w) => !wantCodes.items.includes(w.code));
  const workGoneWhere = `code <> all(${textArray(wantCodes.items)})`;
  const rateGone = rateBookDb.filter(
    (r) => !works.items.some((w) => w.code === r.code && w.uom !== null),
  );
  const rated = works.items.filter((w) => w.uom !== null);
  const ratedWhere = `code = any(${textArray(rated.map((w) => w.code))})`;

  if (rateGone.length > 0) {
    statements.push(
      `delete from estimator_work_info where work_item_id in (select id from work_items where not (${ratedWhere}));`,
    );
  }
  if (workGone.length > 0) statements.push(`delete from work_items where ${workGoneWhere};`);

  const catsNew = works.categories.filter((c) => !workCatByCode.has(c.code));
  const catsChanged = works.categories.filter((c) => {
    const db = workCatByCode.get(c.code);
    return db && (db.name !== c.name || db.sort_order !== c.sort_order || !db.is_active);
  });
  const catsColumns = "code text, name text, sort_order int";
  if (catsNew.length > 0) {
    statements.push(
      `insert into work_categories (code, name, sort_order, is_active)
       select r.code, r.name, r.sort_order, true from ${recordset(catsNew, catsColumns)};`,
    );
  }
  if (catsChanged.length > 0) {
    statements.push(
      `update work_categories w set name = r.name, sort_order = r.sort_order, is_active = true
       from ${recordset(catsChanged, catsColumns)} where w.code = r.code;`,
    );
  }

  const groupsNew = works.groups.filter((g) => !groupByCode.has(g.code));
  const groupsChanged = works.groups.filter((g) => {
    const db = groupByCode.get(g.code);
    return db && (db.name !== g.name || db.sort_order !== g.sort_order || !db.is_active);
  });
  const groupColumns = "code text, category text, name text, sort_order int";
  if (groupsNew.length > 0) {
    statements.push(
      `insert into work_groups (category_id, code, name, sort_order, is_active)
       select c.id, r.code, r.name, r.sort_order, true
       from ${recordset(groupsNew, groupColumns)} join work_categories c on c.code = r.category;`,
    );
  }
  if (groupsChanged.length > 0) {
    statements.push(
      `update work_groups g set name = r.name, sort_order = r.sort_order, is_active = true
       from ${recordset(groupsChanged, groupColumns)} where g.code = r.code;`,
    );
  }

  const itemsNew = works.items.filter((w) => !workByCode.has(w.code));
  const itemsChanged = works.items.filter((w) => {
    const db = workByCode.get(w.code);
    return (
      db &&
      (db.category !== w.category ||
        db.group !== w.group ||
        db.name !== w.name ||
        db.sort_order !== w.sort_order ||
        !db.is_active)
    );
  });
  const itemColumns = "code text, category text, grp text, name text, sort_order int";
  const itemRows = (list: typeof works.items) =>
    list.map((w) => ({
      code: w.code,
      category: w.category,
      grp: w.group,
      name: w.name,
      sort_order: w.sort_order,
    }));
  if (itemsChanged.length > 0) {
    statements.push(
      `update work_items w set category_id = c.id, group_id = g.id, name = r.name, sort_order = r.sort_order, is_active = true
       from ${recordset(itemRows(itemsChanged), itemColumns)}
       join work_categories c on c.code = r.category
       left join work_groups g on g.code = r.grp
       where w.code = r.code;`,
    );
  }
  if (itemsNew.length > 0) {
    statements.push(
      `insert into work_items (category_id, group_id, code, name, sort_order, is_active)
       select c.id, g.id, r.code, r.name, r.sort_order, true
       from ${recordset(itemRows(itemsNew), itemColumns)}
       join work_categories c on c.code = r.category
       left join work_groups g on g.code = r.grp;`,
    );
  }

  const groupsGone = groupsDb.filter((g) => !wantCodes.groups.includes(g.code));
  const catsGone = workCatsDb.filter((c) => !wantCodes.categories.includes(c.code));
  if (groupsGone.length > 0) {
    statements.push(`delete from work_groups where code <> all(${textArray(wantCodes.groups)});`);
  }
  if (catsGone.length > 0) {
    statements.push(
      `delete from work_categories where code <> all(${textArray(wantCodes.categories)});`,
    );
  }

  const rateWrites = rated.filter((w) => {
    const db = rateByCode.get(w.code);
    return !db || db.uom !== w.uom || db.labour_rate !== w.labour_rate;
  });
  if (rateWrites.length > 0) {
    statements.push(
      `insert into estimator_work_info (work_item_id, uom, labour_rate)
       select w.id, r.uom, r.rate
       from ${recordset(
         rateWrites.map((w) => ({ code: w.code, uom: w.uom, rate: w.labour_rate })),
         "code text, uom text, rate numeric",
       )}
       join work_items w on w.code = r.code
       on conflict (work_item_id) do update set uom = excluded.uom, labour_rate = excluded.labour_rate;`,
    );
  }

  const worksTouched =
    catsNew.length +
    catsChanged.length +
    catsGone.length +
    groupsNew.length +
    groupsChanged.length +
    groupsGone.length +
    itemsNew.length +
    itemsChanged.length +
    workGone.length;
  if (worksTouched > 0) {
    say(
      `Work categories: + ${catsNew.map((c) => c.code).join(", ") || "none"}; ~ ${catsChanged.length}; − ${catsGone.map((c) => `${c.code} ${c.name}`).join(", ") || "none"}`,
    );
    say(
      `Work groups: + ${groupsNew.map((g) => g.code).join(", ") || "none"}; ~ ${groupsChanged.length}; − ${groupsGone.map((g) => `${g.code} ${g.name}`).join(", ") || "none"}`,
    );
    say(
      `Works: + ${itemsNew.length} new, ~ ${itemsChanged.length} changed, − ${workGone.length} no longer listed`,
    );
  }
  if (rateWrites.length + rateGone.length > 0) {
    say(
      `Rate book: ${rateWrites.length} labour rates written, − ${rateGone.length} no longer priced`,
    );
  }

  // --- Nothing may still point at what goes -------------------------------------
  const stopped = [
    ...(matGone.length > 0 ? await blockers(ref, "items", matGoneWhere) : []),
    ...(catGone.length > 0 ? await blockers(ref, "item_categories", catGoneWhere, ["items"]) : []),
    ...(stageGone.length > 0 ? await blockers(ref, "construction_stages", stageGoneWhere) : []),
    ...(vendorGone.length > 0
      ? await blockers(ref, "vendors", vendorGoneWhere, ["vendor_payment_details"])
      : []),
    ...(workGone.length > 0
      ? await blockers(ref, "work_items", workGoneWhere, ["estimator_work_info"])
      : []),
  ];

  console.log(report.length > 0 ? report.join("\n") : "Everything is already in place.");
  if (stopped.length > 0) {
    throw new Error(
      `\nRecords still point at masters the workbook drops — run scripts/wipe-staging-records.ts first. Nothing written.\n  ${stopped.join("\n  ")}`,
    );
  }

  if (!commit) {
    console.log("\nDry run — nothing written. Re-run with --commit to apply.");
    return;
  }
  if (statements.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  // The counts the transaction must end on, or it rolls back.
  const expect: [string, string, number][] = [
    ["vendors", "select count(*) from vendors", vendors.length],
    [
      "contractors",
      "select count(*) from vendors where is_contractor",
      vendors.filter((v) => v.is_contractor).length,
    ],
    ["materials", "select count(*) from items where kind = 'material'", materials.length],
    [
      "material categories",
      "select count(*) from item_categories where kind = 'material'",
      materialCategories.length,
    ],
    ["stages", "select count(*) from construction_stages", stages.length],
    ["work categories", "select count(*) from work_categories", works.categories.length],
    ["work groups", "select count(*) from work_groups", works.groups.length],
    ["works", "select count(*) from work_items", works.items.length],
    ["rate book", "select count(*) from estimator_work_info", rated.length],
  ];
  const assertion = `do $$ begin
    ${expect
      .map(
        ([label, query, n]) =>
          `if (${query}) <> ${n} then raise exception 'expected ${n} ${label}, found %', (${query}); end if;`,
      )
      .join("\n    ")}
  end $$;`;

  const dir = await backupTables(ref, "masters", TOUCHED);
  console.log(`\nBacked up to ${dir}`);
  await sql(ref, `begin;\n${statements.join("\n")}\n${assertion}\ncommit;`);
  console.log(
    "Written, and the counts check out. Re-run without --commit: it should find everything in place.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
