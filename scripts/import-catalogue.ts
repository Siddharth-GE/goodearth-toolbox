/**
 * One-off importer for the Goodearth catalogue (~2,631 items).
 *
 *   npx tsx scripts/import-catalogue.ts            # dry run — writes NOTHING
 *   npx tsx scripts/import-catalogue.ts --commit   # actually writes
 *
 * Reads data/item_categories.csv, data/brands.csv and
 * data/items_catalogue.csv, creates any missing categories/brands, then
 * inserts items with category/brand resolved to real foreign keys.
 *
 * Safe to run twice: items are matched on their unique `code` and anything
 * already in the database is skipped, so a half-finished run is fixed by
 * simply running it again.
 *
 * Uses the service-role key because item writes are admin-only under RLS
 * (0004_masters.sql) and a script has no Supabase Auth session. That's the
 * same justification as lib/supabase/admin.ts — this is trusted local code,
 * never anything the browser sees.
 *
 * Images are deliberately NOT handled here. image_url/source_url are stored
 * as given and thumb_url is left empty; a separate, re-runnable pass fetches
 * and resizes thumbnails later. Bundling ~900 network fetches into this
 * import would let one flaky moment wreck an otherwise clean data load.
 */
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "../lib/supabase/database.types";

// Next.js loads .env.local automatically; a plain node script does not.
config({ path: resolve(import.meta.dirname, "..", ".env.local") });

// Mirrors the CHECK constraints in supabase/migrations/0004_masters.sql.
// Declared here rather than imported so this script stays standalone —
// lib/masters/items.ts is "server-only" and pulls in the Next.js runtime.
const ITEM_KINDS = ["catalogue", "material"] as const;
const PLACEMENTS = ["fixed", "loose", "soft_furnishing"] as const;
const UOMS = ["each", "rft", "sqft", "lumpsum", "bag", "kg", "litre", "cft"] as const;

const DATA_DIR = resolve(import.meta.dirname, "..", "data");
const BATCH_SIZE = 500;

type ItemInsert = Database["public"]["Tables"]["items"]["Insert"];

type CategoryCsvRow = { name: string; kind: string };
type BrandCsvRow = { name: string };
type ItemCsvRow = {
  code: string;
  name: string;
  description: string;
  kind: string;
  category: string;
  brand: string;
  placement: string;
  default_uom: string;
  indicative_price: string;
  source_url: string;
  image_url: string;
  is_active: string;
};

function readCsv<T>(file: string): T[] {
  const text = readFileSync(resolve(DATA_DIR, file), "utf8");
  return parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as T[];
}

/** "" and whitespace-only become null — a blank cell is absent, not empty. */
function orNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function main() {
  const commit = process.argv.includes("--commit");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(
    commit
      ? "\n=== COMMIT RUN — this writes to the database ===\n"
      : "\n=== DRY RUN — nothing will be written ===\n",
  );

  // --- Read ---------------------------------------------------------------
  const csvCategories = readCsv<CategoryCsvRow>("item_categories.csv");
  const csvBrands = readCsv<BrandCsvRow>("brands.csv");
  const csvItems = readCsv<ItemCsvRow>("items_catalogue.csv");
  console.log(
    `Read ${csvItems.length} items, ${csvCategories.length} categories, ${csvBrands.length} brands from data/`,
  );

  // --- Validate -----------------------------------------------------------
  // Every problem is collected and reported at once; nothing is silently
  // dropped or coerced. A bad file should fail loudly before any write.
  const errors: string[] = [];
  const categoryNames = new Set(csvCategories.map((c) => c.name.trim()));
  const brandNames = new Set(csvBrands.map((b) => b.name.trim()));

  csvItems.forEach((row, index) => {
    const line = index + 2; // +1 for the header, +1 for 1-based line numbers
    const where = `line ${line} (${row.code || "no code"})`;
    if (!orNull(row.code)) errors.push(`${where}: blank code`);
    if (!orNull(row.name)) errors.push(`${where}: blank name`);
    if (!ITEM_KINDS.includes(row.kind?.trim() as (typeof ITEM_KINDS)[number]))
      errors.push(`${where}: kind "${row.kind}" is not catalogue/material`);
    if (!UOMS.includes(row.default_uom?.trim() as (typeof UOMS)[number]))
      errors.push(`${where}: default_uom "${row.default_uom}" is not one of ${UOMS.join(", ")}`);
    const placement = orNull(row.placement);
    if (placement && !PLACEMENTS.includes(placement as (typeof PLACEMENTS)[number]))
      errors.push(`${where}: placement "${placement}" is not one of ${PLACEMENTS.join(", ")}`);
    const price = orNull(row.indicative_price);
    if (price && !/^\d+(\.\d+)?$/.test(price))
      errors.push(`${where}: price "${price}" is not a number`);
    const category = orNull(row.category);
    if (!category) errors.push(`${where}: blank category`);
    else if (!categoryNames.has(category))
      errors.push(`${where}: category "${category}" is not in item_categories.csv`);
    const brand = orNull(row.brand);
    if (brand && !brandNames.has(brand))
      errors.push(`${where}: brand "${brand}" is not in brands.csv`);
  });

  if (errors.length > 0) {
    console.error(`\n${errors.length} validation problem(s) — nothing was written:\n`);
    for (const message of errors.slice(0, 40)) console.error(`  ${message}`);
    if (errors.length > 40) console.error(`  …and ${errors.length - 40} more`);
    process.exit(1);
  }
  console.log("Validation passed — all rows match the database's allowed values.");

  // --- Dedupe on code (keep first) ---------------------------------------
  const seen = new Set<string>();
  const uniqueItems: ItemCsvRow[] = [];
  const duplicates: string[] = [];
  for (const row of csvItems) {
    const code = row.code.trim();
    if (seen.has(code)) duplicates.push(code);
    else {
      seen.add(code);
      uniqueItems.push(row);
    }
  }
  if (duplicates.length > 0) {
    console.log(`\nDropped ${duplicates.length} duplicate code(s), keeping the first of each:`);
    for (const code of duplicates.slice(0, 20)) console.log(`  ${code}`);
  }

  // --- Compare against what's already in the database ---------------------
  const [existingCategories, existingBrands, existingCodes] = await Promise.all([
    supabase.from("item_categories").select("id, name"),
    supabase.from("brands").select("id, name"),
    supabase.from("items").select("code"),
  ]);
  for (const result of [existingCategories, existingBrands, existingCodes]) {
    if (result.error) {
      console.error("Could not read current database state:", result.error.message);
      process.exit(1);
    }
  }

  const categoryIdByName = new Map((existingCategories.data ?? []).map((c) => [c.name, c.id]));
  const brandIdByName = new Map((existingBrands.data ?? []).map((b) => [b.name, b.id]));
  const codesInDb = new Set(
    (existingCodes.data ?? []).map((i) => i.code).filter(Boolean) as string[],
  );

  const categoriesToCreate = csvCategories.filter((c) => !categoryIdByName.has(c.name.trim()));
  const brandsToCreate = csvBrands.filter((b) => !brandIdByName.has(b.name.trim()));
  const itemsToInsert = uniqueItems.filter((row) => !codesInDb.has(row.code.trim()));
  const alreadyPresent = uniqueItems.length - itemsToInsert.length;

  // --- Report -------------------------------------------------------------
  console.log("\n--- Plan ---");
  console.log(
    `  Categories to create : ${categoriesToCreate.length} (${existingCategories.data?.length ?? 0} already in DB)`,
  );
  if (categoriesToCreate.length > 0)
    console.log(`      ${categoriesToCreate.map((c) => c.name).join(", ")}`);
  console.log(
    `  Brands to create     : ${brandsToCreate.length} (${existingBrands.data?.length ?? 0} already in DB)`,
  );
  if (brandsToCreate.length > 0)
    console.log(`      ${brandsToCreate.map((b) => b.name).join(", ")}`);
  console.log(`  Items to insert      : ${itemsToInsert.length}`);
  console.log(`  Items already in DB  : ${alreadyPresent} (skipped)`);

  const perCategory = new Map<string, number>();
  for (const row of itemsToInsert)
    perCategory.set(row.category, (perCategory.get(row.category) ?? 0) + 1);
  console.log("\n  Items per category:");
  for (const [name, count] of [...perCategory].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(count).padStart(5)}  ${name}`);
  }
  const withImage = itemsToInsert.filter((row) => orNull(row.image_url)).length;
  console.log(
    `\n  With an image URL    : ${withImage} of ${itemsToInsert.length} (thumbnails handled by a later pass)`,
  );

  if (!commit) {
    console.log("\nDry run complete. Nothing was written.");
    console.log("Re-run with --commit to apply.\n");
    return;
  }

  // --- Write --------------------------------------------------------------
  if (categoriesToCreate.length > 0) {
    const { error } = await supabase
      .from("item_categories")
      .insert(categoriesToCreate.map((c) => ({ name: c.name.trim(), kind: c.kind.trim() })));
    if (error) {
      console.error("Creating categories failed:", error.message);
      process.exit(1);
    }
    console.log(`\nCreated ${categoriesToCreate.length} categories.`);
  }

  if (brandsToCreate.length > 0) {
    const { error } = await supabase
      .from("brands")
      .insert(brandsToCreate.map((b) => ({ name: b.name.trim() })));
    if (error) {
      console.error("Creating brands failed:", error.message);
      process.exit(1);
    }
    console.log(`Created ${brandsToCreate.length} brands.`);
  }

  // Re-read so the newly created rows have their generated ids.
  const [freshCategories, freshBrands] = await Promise.all([
    supabase.from("item_categories").select("id, name"),
    supabase.from("brands").select("id, name"),
  ]);
  const catId = new Map((freshCategories.data ?? []).map((c) => [c.name, c.id]));
  const brandId = new Map((freshBrands.data ?? []).map((b) => [b.name, b.id]));

  const rows: ItemInsert[] = itemsToInsert.map((row) => {
    const categoryId = catId.get(row.category.trim());
    if (!categoryId)
      throw new Error(
        `No category id for "${row.category}" — should be impossible after validation`,
      );
    const brand = orNull(row.brand);
    const price = orNull(row.indicative_price);
    return {
      code: orNull(row.code),
      name: row.name.trim(),
      description: orNull(row.description),
      kind: row.kind.trim(),
      category_id: categoryId,
      brand_id: brand ? (brandId.get(brand) ?? null) : null,
      placement: orNull(row.placement),
      default_uom: row.default_uom.trim(),
      indicative_price: price === null ? null : Number(price),
      source_url: orNull(row.source_url),
      image_url: orNull(row.image_url),
      thumb_url: null,
      is_active: row.is_active.trim().toLowerCase() !== "false",
    };
  });

  let inserted = 0;
  for (const [index, batch] of chunk(rows, BATCH_SIZE).entries()) {
    const { error } = await supabase.from("items").insert(batch);
    if (error) {
      console.error(`\nBatch ${index + 1} failed after ${inserted} rows:`, error.message);
      console.error(
        "Re-run the script — already-inserted codes are skipped, so it will resume cleanly.",
      );
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`  inserted ${inserted}/${rows.length}`);
  }

  console.log(`\nDone. ${inserted} items inserted.\n`);
}

main().catch((error) => {
  console.error("\nImport failed:", error);
  process.exit(1);
});
