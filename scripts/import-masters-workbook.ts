/**
 * Loads the masters workbook into one database: vendors and contractors (bank details into the gated
 * vendor_payment_details), material categories, materials with their GST %, and the estate's works with
 * their labour rates (into the Estimator's rate book). Cleaning rules: lib/masters/masters-workbook.ts
 * (vendors, materials) and lib/masters/works-workbook.ts (works).
 *
 *   npx tsx scripts/import-masters-workbook.ts --project <ref> --xlsx <path>            # dry run
 *   npx tsx scripts/import-masters-workbook.ts --project <ref> --xlsx <path> --commit
 *
 * The workbook is read where it lies, never copied into the repo (vendors carry bank accounts).
 * Nothing is deleted: a vendor, material or category the sheet no longer lists is left as it is and
 * named; a work the sheet no longer lists is switched off. Today's works keep their ids and take the
 * new codes (founder, 2026-10-22), so every estimate, log, issue and drawing follows.
 * A blank cell keeps what the database has (payment terms, GST). One transaction ending in checks;
 * a re-run writes nothing. --commit first backs up the changed tables to data/backups/ (gitignored).
 */
import { randomUUID } from "node:crypto";

import {
  type BankDetails,
  VENDOR_DETAILS,
  type WorkbookVendor,
  looseKey,
  materialCategoriesFromSheet,
  materialsFromSheet,
  vendorsFromSheet,
} from "../lib/masters/masters-workbook";
import {
  type DbWork,
  type EstateWork,
  estateWorks,
  matchWorks,
  villaBridge,
} from "../lib/masters/works-workbook";
import { backupTables } from "./backup-tables";
import { readWorkbook } from "./read-xlsx";
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

const TOUCHED = [
  "vendors",
  "vendor_payment_details",
  "items",
  "item_categories",
  "uoms",
  "work_categories",
  "work_groups",
  "work_items",
  "estimator_work_info",
] as const;

/** Today's categories the new sheet spells differently: same row, new code. */
const CATEGORY_RECODES: Record<string, string> = { CARP: "CAR" };

/** How a SketchUp model measures works whose unit alone would mislead (0118, re-keyed to the new codes). */
const BASE_AND_SIDES = ["FD.03.04"];
const MEASURED_BY_HAND = ["FD.03.05", "FD.04.04", "FD.04.11", "FD.04.12", "FD.04.13", "FD.04.14"];

const lit = (value: string | number | boolean | null): string =>
  value === null ? "null" : typeof value === "string" ? literal(value) : String(value);

const textArray = (values: readonly string[]) => `array[${values.map(literal).join(", ")}]::text[]`;

const recordset = (rows: object[], columns: string) =>
  `jsonb_populate_recordset(null::record, ${literal(JSON.stringify(rows))}::jsonb) as r(${columns})`;

type DbVendor = {
  id: string;
  name: string;
  is_active: boolean;
  is_contractor: boolean;
  payment_term_days: number | null;
  bank: BankDetails | null;
} & Record<(typeof VENDOR_DETAILS)[number], string | null>;

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

type DbWorkRow = {
  id: string;
  code: string;
  category: string;
  group: string | null;
  name: string;
  sort_order: number;
  is_active: boolean;
  uom: string | null;
  labour_rate: number | null;
  estimate_lines: number;
  uses: number;
};

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);
  const xlsxAt = argv.indexOf("--xlsx");
  const xlsxPath = xlsxAt === -1 ? undefined : argv[xlsxAt + 1];
  if (!xlsxPath || xlsxPath.startsWith("--"))
    throw new Error("--xlsx <path to the masters workbook> is required.");

  const workbook = readWorkbook(xlsxPath);
  const sheet = (name: string) => {
    const rows = workbook.get(name);
    if (!rows) throw new Error(`The workbook has no "${name}" sheet.`);
    return rows;
  };
  const { vendors, notes: vendorNotes } = vendorsFromSheet(sheet("Vendor & Contractor Names"));
  const materialCategories = materialCategoriesFromSheet(sheet("Material Category"));
  const { materials, notes: materialNotes } = materialsFromSheet(
    sheet("Material Master"),
    materialCategories,
  );
  const estate = estateWorks({
    infrastructure: sheet("Infrastructure - Work"),
    mobilisation: sheet("Mobilisation - Works"),
    maintenance: sheet("Maintenance - Works"),
  });
  const bridge = villaBridge(sheet("Villas - Work"), estate);
  const liveWorks = estate.works.filter((w) => !w.left_out);

  console.log(`Database : ${ref}`);
  console.log(`Workbook : ${xlsxPath}`);
  console.log(`Mode     : ${commit ? "COMMIT" : "dry run"}\n`);
  console.log(
    `The workbook: ${vendors.length} vendors (${vendors.filter((v) => v.is_contractor).length} contractors), ` +
      `${materialCategories.length} material categories, ${materials.length} materials ` +
      `(${materials.filter((m) => m.gst_pct !== null).length} with a GST %), ` +
      `${estate.categories.length} work categories, ${estate.groups.length} groups, ${liveWorks.length} works ` +
      `(${liveWorks.filter((w) => w.uom).length} in the rate book, ${liveWorks.filter((w) => w.is_package).length} stage packages).\n`,
  );
  console.log("What the cleaning decided:");
  for (const note of [
    ...vendorNotes.filter((n) => !n.includes(" times (rows")),
    ...materialNotes,
    ...estate.notes,
    ...estate.works
      .filter((w) => w.left_out)
      .map((w) => `${w.code} "${w.name}" left out — ${w.left_out}.`),
  ]) {
    console.log(`  · ${note}`);
  }
  const repeats = vendorNotes.filter((n) => n.includes(" times (rows")).length;
  console.log(`  · ${repeats} vendor names the sheet repeats are one vendor each.\n`);

  const [uoms, gstRates, categoriesDb, itemsDb, vendorsDb, workCatsDb, groupsDb, workItemsDb] =
    await Promise.all([
      sql<{ name: string; sort_order: number }>(ref, `select name, sort_order from uoms`),
      sql<{ rate: number }>(ref, `select rate::float8 as rate from gst_rates where is_active`),
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
        gst_pct: number | null;
        is_active: boolean;
      }>(
        ref,
        `select i.id, i.code, i.kind, i.name, i.description, c.name as category, i.default_uom,
                i.indicative_price::float8 as indicative_price, i.gst_pct::float8 as gst_pct, i.is_active
           from items i join item_categories c on c.id = i.category_id`,
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
      sql<{
        id: string;
        code: string;
        name: string;
        family: string;
        sort_order: number;
        is_active: boolean;
      }>(ref, `select id, code, name, family, sort_order, is_active from work_categories`),
      sql<{
        id: string;
        code: string;
        category: string;
        name: string;
        sort_order: number;
        is_active: boolean;
      }>(
        ref,
        `select g.id, g.code, c.code as category, g.name, g.sort_order, g.is_active
           from work_groups g join work_categories c on c.id = g.category_id`,
      ),
      sql<DbWorkRow>(
        ref,
        `select w.id, w.code, c.code as category, g.code as "group", w.name, w.sort_order, w.is_active,
                r.uom, r.labour_rate::float8 as labour_rate,
                (select count(*) from estimator_estimate_lines x where x.work_item_id = w.id)::int as estimate_lines,
                ((select count(*) from estimator_estimate_lines x where x.work_item_id = w.id) +
                 (select count(*) from labour_logs x where x.work_item_id = w.id) +
                 (select count(*) from stock_issues x where x.work_item_id = w.id) +
                 (select count(*) from goods_receipts x where x.work_item_id = w.id) +
                 (select count(*) from indents x where x.work_item_id = w.id) +
                 (select count(*) from issue_requests x where x.work_item_id = w.id) +
                 (select count(*) from labour_contract_lines x where x.work_item_id = w.id) +
                 (select count(*) from bill_lines x where x.work_item_id = w.id) +
                 (select count(*) from drawing_revision_works x where x.work_item_id = w.id) +
                 (select count(*) from estimator_work_components x where x.work_item_id = w.id))::int as uses
           from work_items w join work_categories c on c.id = w.category_id
           left join work_groups g on g.id = w.group_id
           left join estimator_work_info r on r.work_item_id = w.id`,
      ),
    ]);

  const statements: string[] = [];
  const report: string[] = [];
  const say = (line: string) => report.push(line);

  // Units of measure the sheets name and Masters lacks.
  const haveUoms = new Set(uoms.map((u) => u.name));
  const wantUoms = [
    ...new Set([
      ...materials.map((m) => m.uom),
      ...liveWorks.flatMap((w) => (w.uom ? [w.uom] : [])),
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

  // GST: only the rates the PO picker offers.
  const allowedGst = new Set(gstRates.map((g) => g.rate));
  for (const m of materials) {
    if (m.gst_pct !== null && !allowedGst.has(m.gst_pct))
      throw new Error(
        `${m.code}: GST ${m.gst_pct}% is not on the GST rates list (${[...allowedGst].join(", ")}).`,
      );
  }

  // Material categories: new and changed; one the sheet drops is left alone.
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
  const catUnlisted = categoriesDb.filter(
    (c) =>
      c.kind === "material" &&
      c.is_active &&
      !materialCategories.some((m) => m.name.toLowerCase() === c.name.toLowerCase()),
  );
  if (catNew.length + catChanged.length + catUnlisted.length > 0) {
    say(
      `Material categories: + ${catNew.map((c) => c.name).join(", ") || "none"}; ~ ${catChanged.length}; not in the sheet, left as they are: ${catUnlisted.map((c) => c.name).join(", ") || "none"}`,
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

  // Materials: a blank GST cell keeps Masters' figure.
  const itemByCode = new Map(itemsDb.filter((i) => i.code).map((i) => [i.code as string, i]));
  for (const m of materials) {
    if (itemByCode.get(m.code)?.kind === "catalogue") {
      throw new Error(`${m.code} is already a catalogue item's code.`);
    }
  }
  const gstOf = (m: (typeof materials)[number]) =>
    m.gst_pct ?? itemByCode.get(m.code)?.gst_pct ?? null;
  // A Masters rate rises with POs and never falls by itself (0103); a paisa of rounding is no change.
  const priceOf = (m: (typeof materials)[number]) => {
    const db = itemByCode.get(m.code)?.indicative_price ?? null;
    if (db === null || m.indicative_price === null) return db ?? m.indicative_price;
    return m.indicative_price > db + 0.01 ? m.indicative_price : db;
  };
  const matNew = materials.filter((m) => !itemByCode.has(m.code));
  const matChanged = materials.filter((m) => {
    const db = itemByCode.get(m.code);
    return (
      db &&
      (db.name !== m.name ||
        db.description !== null ||
        db.category.toLowerCase() !== m.category.toLowerCase() ||
        db.default_uom !== m.uom ||
        db.indicative_price !== priceOf(m) ||
        db.gst_pct !== gstOf(m) ||
        !db.is_active)
    );
  });
  const matCodes = new Set(materials.map((m) => m.code));
  const matUnlisted = itemsDb.filter(
    (i) => i.kind === "material" && i.is_active && (i.code === null || !matCodes.has(i.code)),
  );
  if (matNew.length + matChanged.length + matUnlisted.length > 0) {
    say(
      `Materials: + ${matNew.length} new, ~ ${matChanged.length} changed, ${matUnlisted.length} not in the sheet, left as they are`,
    );
    for (const i of matUnlisted.slice(0, 20)) say(`    = ${i.code ?? "(no code)"} ${i.name}`);
    if (matUnlisted.length > 20) say(`    … and ${matUnlisted.length - 20} more`);
    for (const m of matChanged.slice(0, 20)) {
      const db = itemByCode.get(m.code)!;
      say(
        `    ~ ${m.code} ${db.name !== m.name ? `"${db.name}" → "${m.name}" ` : ""}${db.indicative_price !== priceOf(m) ? `rate ${db.indicative_price ?? "—"} → ${priceOf(m) ?? "—"} ` : ""}${db.default_uom !== m.uom ? `unit ${db.default_uom} → ${m.uom} ` : ""}`,
      );
    }
    if (matChanged.length > 20) say(`    … and ${matChanged.length - 20} more changed`);
  }
  const matColumns = "code text, name text, category text, uom text, price numeric, gst numeric";
  const matRows = (list: typeof materials) =>
    list.map((m) => ({
      code: m.code,
      name: m.name,
      category: m.category,
      uom: m.uom,
      price: priceOf(m),
      gst: gstOf(m),
    }));
  if (matChanged.length > 0) {
    statements.push(
      `update items i set name = r.name, description = null, category_id = c.id, default_uom = r.uom,
              indicative_price = r.price, gst_pct = r.gst, is_active = true
       from ${recordset(matRows(matChanged), matColumns)}
       join item_categories c on lower(c.name) = lower(r.category) and c.kind = 'material'
       where i.code = r.code and i.kind = 'material';`,
    );
  }
  if (matNew.length > 0) {
    statements.push(
      `insert into items (code, name, kind, category_id, default_uom, indicative_price, gst_pct, is_active, is_provisional)
       select r.code, r.name, 'material', c.id, r.uom, r.price, r.gst, true, false
       from ${recordset(matRows(matNew), matColumns)}
       join item_categories c on lower(c.name) = lower(r.category) and c.kind = 'material';`,
    );
  }

  // Vendors: a blank cell keeps the database value; one the sheet drops is left alone.
  const matched = matchVendors(vendors, vendorsDb);
  const matchedIds = new Set([...matched.values()].map((v) => v.id));
  const vendorNew = vendors.filter((v) => !matched.has(v));
  const vendorUnlisted = vendorsDb.filter((v) => v.is_active && !matchedIds.has(v.id));
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
    if (vendor.is_contractor && !db.is_contractor) sets.push("is_contractor = true");
    for (const field of VENDOR_DETAILS) {
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
  if (vendorNew.length + vendorChanged + vendorUnlisted.length + bankWrites > 0) {
    say(
      `Vendors: + ${vendorNew.length} new, ~ ${vendorChanged} changed, ${vendorUnlisted.length} not in the sheet (left as they are), ${bankWrites} bank details written`,
    );
    for (const [vendor, db] of matched) {
      if (db.name !== vendor.name) say(`    ~ "${db.name}" is now "${vendor.name}"`);
    }
    for (const vendor of vendorNew)
      say(`    + ${vendor.name}${vendor.is_contractor ? "  [contractor]" : ""}`);
    for (const v of vendorUnlisted) say(`    = ${v.name}`);
  }

  // Works.
  const dbWorks: DbWork[] = workItemsDb.map((w) => ({
    id: w.id,
    code: w.code,
    category: w.category,
    name: w.name,
    uses: w.uses,
    priced: w.labour_rate !== null,
  }));
  const { matches, notes: matchNotes } = matchWorks(dbWorks, estate, bridge);
  const dbWorkById = new Map(workItemsDb.map((w) => [w.id, w]));
  const sheetWork = new Map(liveWorks.map((w) => [w.code, w]));
  const idOfNew = new Map<string, string>();
  for (const m of matches) if (m.newCode) idOfNew.set(m.newCode, m.work.id);
  const inserted = new Set(liveWorks.filter((w) => !idOfNew.has(w.code)).map((w) => w.code));
  for (const code of inserted) idOfNew.set(code, randomUUID());

  // Categories: by code (or the recode), taking the sheet's name, family and order.
  const catIdOf = new Map<string, string>();
  for (const c of estate.categories) {
    const db =
      workCatsDb.find((d) => d.code === c.code) ??
      workCatsDb.find((d) => CATEGORY_RECODES[d.code] === c.code);
    if (db) {
      catIdOf.set(c.code, db.id);
      if (
        db.code !== c.code ||
        db.name !== c.name ||
        db.family !== c.family ||
        db.sort_order !== c.sort_order ||
        !db.is_active
      ) {
        statements.push(
          `update work_categories set code = ${literal(c.code)}, name = ${literal(c.name)}, family = ${literal(c.family)},
             sort_order = ${c.sort_order}, is_active = true where id = ${literal(db.id)};`,
        );
        say(`  ~ category ${db.code} "${db.name}" → ${c.code} "${c.name}" (${c.family})`);
      }
    } else {
      const id = randomUUID();
      catIdOf.set(c.code, id);
      statements.push(
        `insert into work_categories (id, code, name, family, sort_order, is_active)
         values (${literal(id)}, ${literal(c.code)}, ${literal(c.name)}, ${literal(c.family)}, ${c.sort_order}, true);`,
      );
      say(`  + category ${c.code} "${c.name}" (${c.family})`);
    }
  }
  const keptCatIds = new Set(catIdOf.values());
  const catsOff = workCatsDb.filter((d) => d.is_active && !keptCatIds.has(d.id));
  for (const d of catsOff) say(`  − category ${d.code} "${d.name}" switched off`);

  // Groups: by code; a group the sheet no longer has is switched off once its works have moved.
  const groupIdOf = new Map<string, string>();
  for (const g of estate.groups) {
    const db = groupsDb.find((d) => d.code === g.code);
    const catId = catIdOf.get(g.category)!;
    if (db) {
      groupIdOf.set(g.code, db.id);
      statements.push(
        `update work_groups set category_id = ${literal(catId)}, name = ${literal(g.name)}, sort_order = ${g.sort_order}, is_active = true
         where id = ${literal(db.id)};`,
      );
    } else {
      const id = randomUUID();
      groupIdOf.set(g.code, id);
      statements.push(
        `insert into work_groups (id, category_id, code, name, sort_order, is_active)
         values (${literal(id)}, ${literal(catId)}, ${literal(g.code)}, ${literal(g.name)}, ${g.sort_order}, true);`,
      );
    }
  }
  const keptGroupIds = new Set(groupIdOf.values());
  const groupsOff = groupsDb.filter((d) => d.is_active && !keptGroupIds.has(d.id));

  // Works: matched ones re-coded through a placeholder (today's SS.3 is a sub-work's new code), new ones inserted.
  const changed = matches.filter((m) => {
    if (!m.newCode) return false;
    const w = sheetWork.get(m.newCode)!;
    const db = dbWorkById.get(m.work.id)!;
    return (
      db.code !== w.code ||
      db.name !== w.name ||
      db.category !== w.category ||
      db.group !== w.group ||
      db.sort_order !== w.sort_order ||
      !db.is_active
    );
  });
  const workRow = (w: EstateWork) => ({
    id: idOfNew.get(w.code),
    code: w.code,
    category_id: catIdOf.get(w.category),
    group_id: w.group ? groupIdOf.get(w.group) : null,
    name: w.name,
    sort_order: w.sort_order,
  });
  const workColumns =
    "id uuid, code text, category_id uuid, group_id uuid, name text, sort_order int";
  if (changed.length > 0) {
    statements.push(
      `update work_items set code = '~' || id::text where id in (${changed.map((m) => literal(m.work.id)).join(", ")});`,
      `update work_items w set code = r.code, category_id = r.category_id, group_id = r.group_id, name = r.name,
              sort_order = r.sort_order, is_active = true
       from ${recordset(
         changed.map((m) => workRow(sheetWork.get(m.newCode!)!)),
         workColumns,
       )} where w.id = r.id;`,
    );
  }
  const newRows = liveWorks.filter((w) => inserted.has(w.code)).map(workRow);
  if (newRows.length > 0) {
    statements.push(
      `insert into work_items (id, code, category_id, group_id, name, sort_order, is_active)
       select r.id, r.code, r.category_id, r.group_id, r.name, r.sort_order, true from ${recordset(newRows, workColumns)};`,
    );
  }
  const worksOff = matches.filter((m) => !m.newCode && dbWorkById.get(m.work.id)!.is_active);
  if (worksOff.length > 0) {
    statements.push(
      `update work_items set is_active = false where id in (${worksOff.map((m) => literal(m.work.id)).join(", ")});`,
    );
  }
  if (groupsOff.length > 0)
    statements.push(
      `update work_groups set is_active = false where id in (${groupsOff.map((d) => literal(d.id)).join(", ")});`,
    );
  if (catsOff.length > 0)
    statements.push(
      `update work_categories set is_active = false where id in (${catsOff.map((d) => literal(d.id)).join(", ")});`,
    );

  const takenCodes = new Set([
    ...liveWorks.map((w) => w.code),
    ...estate.groups.map((g) => g.code),
    ...estate.categories.map((c) => c.code),
  ]);
  for (const m of matches.filter((x) => !x.newCode)) {
    if (takenCodes.has(m.work.code))
      throw new Error(
        `${m.work.code} is switched off but the sheet gives its code to another row.`,
      );
  }

  // The rate book: the sheet's unit and rate; a unit change under an estimate is refused.
  const rateWrites: { id: string; uom: string; rate: number | null }[] = [];
  const rateReport: string[] = [];
  const unitRefusals: string[] = [];
  const rateKept: string[] = [];
  for (const w of liveWorks) {
    const id = idOfNew.get(w.code)!;
    const db = dbWorkById.get(id);
    if (!w.uom) {
      if (db?.uom)
        rateKept.push(
          `${w.code} keeps ${db.labour_rate ?? "no rate"} per ${db.uom} (the sheet gives none)`,
        );
      continue;
    }
    if (db?.uom && db.uom !== w.uom && db.estimate_lines > 0) {
      unitRefusals.push(
        `${w.code} "${w.name}": ${db.uom} → ${w.uom}, used on ${db.estimate_lines} estimate line(s)`,
      );
      continue;
    }
    if (!db || db.uom !== w.uom || db.labour_rate !== w.labour_rate) {
      rateWrites.push({ id, uom: w.uom, rate: w.labour_rate });
      if (db?.uom)
        rateReport.push(
          `${w.code}: ${db.labour_rate ?? "—"}/${db.uom} → ${w.labour_rate ?? "—"}/${w.uom}`,
        );
    }
  }
  if (unitRefusals.length > 0) {
    throw new Error(
      `A rate-book unit would change under an estimate — nothing converts units (estimator/PLAN.md decision 7). Nothing written.\n  ${unitRefusals.join("\n  ")}`,
    );
  }
  if (rateWrites.length > 0) {
    statements.push(
      `insert into estimator_work_info (work_item_id, uom, labour_rate)
       select r.id, r.uom, r.rate from ${recordset(rateWrites, "id uuid, uom text, rate numeric")}
       on conflict (work_item_id) do update set uom = excluded.uom, labour_rate = excluded.labour_rate;`,
    );
  }
  const packageCodes = liveWorks.filter((w) => w.is_package).map((w) => w.code);
  statements.push(
    `update estimator_work_info i set model_measure = 'base_and_sides'
     from work_items w where w.id = i.work_item_id and w.code = any(${textArray(BASE_AND_SIDES)}) and i.model_measure is null;`,
    `update estimator_work_info i set model_measure = 'manual'
     from work_items w where w.id = i.work_item_id and i.model_measure is null
       and w.code = any(${textArray([...MEASURED_BY_HAND, ...packageCodes])});`,
  );

  // The report: what each of today's works becomes, then what is new, in the sheet's order.
  say(
    `Works: ${matches.filter((m) => m.newCode).length} of today's ${matches.length} kept (new code and name), ` +
      `${worksOff.length} switched off, ${inserted.size} new; ${estate.groups.length} groups ` +
      `(${groupsOff.length} old ones switched off); ${rateWrites.length} rate-book rows written.`,
  );
  say("  Today's works:");
  for (const m of matches) {
    const db = dbWorkById.get(m.work.id)!;
    const w = m.newCode ? sheetWork.get(m.newCode)! : null;
    say(
      w
        ? `    ${db.code === w.code && db.name === w.name ? "=" : "~"} ${db.code} "${db.name}" → ${w.code} "${w.name}"  [${m.how}]`
        : `    − ${db.code} "${db.name}" switched off${db.uses > 0 ? `  (in use ${db.uses}×; those records keep it)` : ""}`,
    );
  }
  for (const n of matchNotes) say(`    · ${n}`);
  say("  New:");
  for (const c of estate.categories) {
    const added = liveWorks.filter((w) => w.category === c.code && inserted.has(w.code));
    if (added.length === 0) continue;
    say(`    ${c.family} · ${c.code} ${c.name}: ${added.length} new`);
    for (const w of added)
      say(`      + ${w.code} ${w.name}${w.uom ? `  (${w.labour_rate ?? "—"}/${w.uom})` : ""}`);
  }
  if (rateReport.length > 0) {
    say("  Rate book changes:");
    for (const r of rateReport) say(`    ~ ${r}`);
  }
  for (const r of rateKept) say(`    = ${r}`);

  console.log(report.length > 0 ? report.join("\n") : "Everything is already in place.");

  if (!commit) {
    console.log("\nDry run — nothing written. Re-run with --commit to apply.");
    return;
  }

  // The checks the transaction must end on, or it rolls back. Nothing is ever deleted.
  const liveCodes = liveWorks.map((w) => w.code);
  const expect: [string, string, number][] = [
    ["active works", "select count(*) from work_items where is_active", liveWorks.length],
    ["works", "select count(*) from work_items", workItemsDb.length + inserted.size],
    [
      "active work categories",
      "select count(*) from work_categories where is_active",
      estate.categories.length,
    ],
    [
      "active work groups",
      "select count(*) from work_groups where is_active",
      estate.groups.length,
    ],
    ["vendors", "select count(*) from vendors", vendorsDb.length + vendorNew.length],
    ["items", "select count(*) from items", itemsDb.length + matNew.length],
    [
      "sheet works in Masters",
      `select count(*) from work_items where is_active and code = any(${textArray(liveCodes)})`,
      liveCodes.length,
    ],
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
    "Written, and the checks hold. Re-run without --commit: it should find everything in place.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
