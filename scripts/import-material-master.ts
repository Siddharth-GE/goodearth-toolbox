/**
 * One-off importer for the construction material master — Material.xlsx,
 * sheets "Material Master_New W" (2,050 rows, the base) and "Sheet1"
 * (561 rows, a cleaner re-extract whose description and unit win for the
 * 556 codes it covers), converted to data/material_master.csv and
 * data/material_master_clean.csv (data/ is gitignored).
 *
 *   npx tsx scripts/import-material-master.ts --project <ref>            # dry run
 *   npx tsx scripts/import-material-master.ts --project <ref> --commit   # write
 *
 * Since 0086 materials ARE the items master: every row lands in `items`
 * with kind='material', its category resolved to item_categories (created
 * with kind='material' when missing), its unit mapped into the uoms
 * master (six new everyday units are inserted first), and the sheet's
 * Rate as indicative_price — founder-settled ground (0086: the rate is
 * the item's indicative_price, as visible as item prices already are).
 *
 * Sheet quirks, decided with the founder on 2026-08-20:
 *   - blank unit -> 'nos' (289 of the 403 filled units are Nos anyway);
 *   - blank category -> derived from the code prefix (FIN/510 is
 *     Finishing), anything unresolvable -> Miscellaneous Materials;
 *   - category spellings are normalised (case variants merge, the
 *     sheet's "Miscelleneous" typo is fixed);
 *   - the one duplicated code (PLD/836 names two different products)
 *     keeps its code on the first row; the second is inserted without a
 *     code and flagged for the founder to assign one in Masters.
 *
 * Natural keys: lower(trim(code)) for coded rows, lower(trim(name))
 * within kind='material' for the few code-less ones. A re-run finds
 * everything present and writes nothing.
 *
 * Row data moves via jsonb_populate_recordset (clone-data.ts's rule) —
 * no hand-rolled quoting of 2,050 rows.
 */
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

const DATA_DIR = resolve(import.meta.dirname, "..", "data");

/** Blank-category rows resolve through their code prefix. */
const CATEGORY_BY_PREFIX: Record<string, string> = {
  CVL: "Civil Materials",
  ELE: "Electrical Materials",
  STL: "Steel Materials",
  FIN: "Finishing Materials",
  TILE: "Tiles & Granite Materials",
  PLD: "Plumbing Materials",
  MIS: "Miscellaneous Materials",
  GEN: "Miscellaneous Materials",
  HW: "Hardware & Tools Materials",
  WOD: "Wood Work Materials",
  SAFE: "Safety Materials",
  TE: "Tools and Equipments",
  INT: "Interior Items",
  NUR: "Nursery Plants",
};

/** Canonical material categories; every sheet spelling maps into these. */
const CATEGORY_CANONICAL: Record<string, string> = {
  "civil materials": "Civil Materials",
  "electrical materials": "Electrical Materials",
  "steel materials": "Steel Materials",
  "finishing materials": "Finishing Materials",
  "tiles & granite materials": "Tiles & Granite Materials",
  "plumbing materials": "Plumbing Materials",
  "miscelleneous materials": "Miscellaneous Materials",
  "miscellaneous materials": "Miscellaneous Materials",
  "hardware & tools materials": "Hardware & Tools Materials",
  "wood work materials": "Wood Work Materials",
  "safety materials": "Safety Materials",
  "tools and equipments": "Tools and Equipments",
  "interior items": "Interior Items",
  "nursery plants": "Nursery Plants",
};

const FALLBACK_CATEGORY = "Miscellaneous Materials";

/** Sheet unit spelling -> uoms.name. An unlisted spelling stops the run. */
const UOM_MAP: Record<string, string> = {
  nos: "nos",
  cft: "cft",
  kg: "kg",
  bag: "bag",
  box: "box",
  sqft: "sqft",
  "sq.ft": "sqft",
  liter: "litre",
  ml: "ml",
  "cu.m.": "cum",
  m3: "cum",
  set: "set",
  unit: "each",
  mtr: "mtr",
  roll: "roll",
  length: "length",
  pkt: "pkt",
};
const BLANK_UOM = "nos";

/** Everyday site units 0082's seed list does not carry. */
const NEW_UOMS: { name: string; sort_order: number }[] = [
  { name: "box", sort_order: 150 },
  { name: "mtr", sort_order: 160 },
  { name: "roll", sort_order: 170 },
  { name: "length", sort_order: 180 },
  { name: "pkt", sort_order: 190 },
  { name: "ml", sort_order: 200 },
];

type BigRow = {
  code: string;
  alt_name: string;
  name: string;
  category: string;
  unit: string;
  rate: string;
};
type CleanRow = { category: string; code: string; group: string; description: string; uom: string };

type Material = {
  code: string | null;
  name: string;
  description: string | null;
  category: string;
  uom: string;
  rate: number | null;
};

function readCsv<T>(file: string): T[] {
  let text: string;
  try {
    text = readFileSync(resolve(DATA_DIR, file), "utf8");
  } catch {
    console.error(
      `data/${file} is missing. Convert Material.xlsx first (plan.md step 1) — data/ is gitignored, so the CSVs travel outside git.`,
    );
    process.exit(1);
  }
  return parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as T[];
}

const key = (s: string) => s.trim().toLowerCase();

function mapUom(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return BLANK_UOM;
  const mapped = UOM_MAP[key(trimmed)];
  if (!mapped) {
    console.error(`Unmapped unit spelling "${trimmed}" — extend UOM_MAP before running.`);
    process.exit(1);
  }
  return mapped;
}

function mapCategory(raw: string, code: string | null, flag: (message: string) => void): string {
  const canonical = CATEGORY_CANONICAL[key(raw)];
  if (canonical) return canonical;
  if (raw.trim()) {
    flag(`unknown category "${raw.trim()}" -> ${FALLBACK_CATEGORY}`);
    return FALLBACK_CATEGORY;
  }
  const prefix = (code ?? "").split("/")[0].toUpperCase();
  const derived = CATEGORY_BY_PREFIX[prefix];
  if (derived) return derived;
  flag(`no category and no known prefix (code ${code ?? "none"}) -> ${FALLBACK_CATEGORY}`);
  return FALLBACK_CATEGORY;
}

function buildMaterials(flags: string[]): Material[] {
  const flag = (message: string) => flags.push(message);
  const big = readCsv<BigRow>("material_master.csv");
  const clean = readCsv<CleanRow>("material_master_clean.csv");
  const cleanByCode = new Map(clean.filter((r) => r.code.trim()).map((r) => [key(r.code), r]));

  const materials: Material[] = [];
  const seenCodes = new Set<string>();

  for (const row of big) {
    const rawCode = row.code.trim();
    if (!rawCode) continue;
    let code: string | null = rawCode;
    if (seenCodes.has(key(rawCode))) {
      flag(
        `duplicate code ${rawCode} ("${row.name}") inserted WITHOUT a code — assign one in Masters`,
      );
      code = null;
    } else {
      seenCodes.add(key(rawCode));
    }

    const better = code ? cleanByCode.get(key(code)) : undefined;
    const name = (better?.description.trim() || row.name.trim()).trim();
    if (!name) {
      flag(`row ${rawCode} has no name at all — skipped`);
      continue;
    }
    const description = better?.group.trim() || row.alt_name.trim() || null;
    const category = mapCategory(better?.category ?? row.category, code, flag);
    const uom = mapUom(better?.uom ?? row.unit);
    let rate = row.rate.trim() === "" ? null : Number(row.rate);
    if (!Number.isFinite(rate as number)) rate = null;
    // The rate belongs to the unit it was quoted in. Where the two sheets
    // disagree on the unit (74 rows — bricks priced per box vs per piece),
    // the rate is dropped rather than restated against the other unit:
    // a blank price gets noticed and filled in Masters; a wrong one
    // silently feeds estimates.
    if (rate !== null && better && row.unit.trim() && mapUom(row.unit) !== uom) {
      flag(
        `${rawCode} "${name}": rate ${rate} was per ${row.unit.trim()}, unit is now ${uom} — price cleared, re-enter it in Masters`,
      );
      rate = null;
    }
    materials.push({ code, name, description, category, uom, rate });
  }

  // Sheet1's code-less rows (Laterite blocks, Dust Laterite) ride along.
  for (const row of clean) {
    if (row.code.trim()) continue;
    const name = row.description.trim();
    if (!name) continue;
    materials.push({
      code: null,
      name,
      description: row.group.trim() || null,
      category: mapCategory(row.category, null, flag),
      uom: mapUom(row.uom),
      rate: null,
    });
  }

  return materials;
}

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);

  const flags: string[] = [];
  const materials = buildMaterials(flags);

  console.log(`Database : ${ref}`);
  console.log(`Sheet    : ${materials.length} materials after merging both sheets`);
  console.log(`Mode     : ${commit ? "COMMIT" : "dry run"}\n`);

  // What already exists — the natural keys decide skip vs insert.
  const existing = await sql<{ code: string | null; name: string }>(
    ref,
    "select code, name from items where kind = 'material'",
  );
  const existingCodes = new Set(existing.filter((r) => r.code).map((r) => key(r.code as string)));
  const existingNames = new Set(existing.map((r) => key(r.name)));

  const toInsert = materials.filter((m) =>
    m.code ? !existingCodes.has(key(m.code)) : !existingNames.has(key(m.name)),
  );
  const skipped = materials.length - toInsert.length;

  const existingUoms = new Set(
    (await sql<{ name: string }>(ref, "select name from uoms")).map((r) => key(r.name)),
  );
  const newUoms = NEW_UOMS.filter((u) => !existingUoms.has(u.name));

  const existingCategories = new Set(
    (
      await sql<{ name: string }>(ref, "select name from item_categories where kind = 'material'")
    ).map((r) => key(r.name)),
  );
  const wantedCategories = [...new Set(toInsert.map((m) => m.category))].sort();
  const newCategories = wantedCategories.filter((c) => !existingCategories.has(key(c)));

  const perCategory = new Map<string, number>();
  for (const m of toInsert) perCategory.set(m.category, (perCategory.get(m.category) ?? 0) + 1);
  const perUom = new Map<string, number>();
  for (const m of toInsert) perUom.set(m.uom, (perUom.get(m.uom) ?? 0) + 1);

  console.log(`+ ${toInsert.length} new, = ${skipped} already in the master\n`);
  console.log("Per category (new rows):");
  for (const [category, count] of [...perCategory].sort()) {
    const marker = newCategories.includes(category) ? "   (category will be created)" : "";
    console.log(`  ${category.padEnd(30)} ${count}${marker}`);
  }
  console.log("\nPer unit (new rows):");
  for (const [uom, count] of [...perUom].sort()) {
    const marker = newUoms.some((u) => u.name === uom)
      ? "   (unit will be added to the uoms master)"
      : "";
    console.log(`  ${uom.padEnd(10)} ${count}${marker}`);
  }
  console.log(`\nWith a rate: ${toInsert.filter((m) => m.rate !== null).length}`);
  console.log(`Without a code: ${toInsert.filter((m) => !m.code).length}`);

  if (flags.length > 0) {
    console.log("\nDecided by rule, worth a glance:");
    for (const f of flags) console.log(`  ? ${f}`);
  }

  if (!commit) {
    console.log("\nDry run — nothing written. Re-run with --commit to apply.");
    return;
  }
  if (toInsert.length === 0 && newUoms.length === 0 && newCategories.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  const statements: string[] = [];
  for (const u of newUoms) {
    statements.push(
      `insert into uoms (name, sort_order) values (${literal(u.name)}, ${u.sort_order}) on conflict (name) do nothing;`,
    );
  }
  for (const c of newCategories) {
    statements.push(
      `insert into item_categories (name, kind)
       select ${literal(c)}, 'material'
       where not exists (select 1 from item_categories where lower(name) = ${literal(key(c))});`,
    );
  }
  // jsonb_populate_recordset lets Postgres do every conversion; categories
  // and uoms resolve by name inside the statement.
  const payload = JSON.stringify(
    toInsert.map((m) => ({
      code: m.code,
      name: m.name,
      description: m.description,
      category: m.category,
      uom: m.uom,
      rate: m.rate,
    })),
  );
  statements.push(
    `insert into items (code, name, description, kind, category_id, default_uom, indicative_price, is_active)
     select r.code, r.name, r.description, 'material', c.id, r.uom, r.rate, true
     from jsonb_populate_recordset(
       null::record,
       ${literal(payload)}::jsonb
     ) as r(code text, name text, description text, category text, uom text, rate numeric)
     join item_categories c on lower(c.name) = lower(r.category) and c.kind = 'material';`,
  );

  await sql(ref, `begin;\n${statements.join("\n")}\ncommit;`);

  const count = await sql<{ n: number }>(
    ref,
    "select count(*)::int as n from items where kind = 'material'",
  );
  console.log(`\nDone. ${count[0].n} materials now in the items master.`);
  console.log("Re-run without --commit: it should report 0 new.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
