/**
 * Brings the interiors catalogue spreadsheet (the design team's
 * "Main - Catalogue's" workbook, sheet MAIN CATALOGUE) into the items
 * master: the picture pasted on each row and its product link go onto the
 * item the toolbox already has, and a row the toolbox does not have yet
 * becomes a new item.
 *
 *   npx tsx scripts/import-catalogue-sheet.ts --project <ref> --xlsx <path>            # dry run
 *   npx tsx scripts/import-catalogue-sheet.ts --project <ref> --xlsx <path> --commit   # write
 *
 * Then `scripts/fetch-catalogue-images.ts` finds a picture for the items
 * that have a product link and nothing pasted in the sheet.
 *
 * The founder's instruction (2026-09-26): a picture for every item that
 * has one, the links visible, no duplicates — and "if there are small
 * variations in some data they are probably not a duplicate". How a row
 * is recognised, and why never by its code, is in
 * lib/masters/catalogue-sheet.ts, which is tested.
 *
 * What it never does: replace a picture or a link an item already has,
 * or change any existing item's name, description, price, code or
 * category. The sheet is the design team's working copy; the toolbox's
 * prices are Masters' to edit.
 *
 * Safe to run twice. A second run finds the new items already there
 * (they now match), finds the pictures already set, and writes nothing.
 * The workbook is not committed — it carries real prices — so pass the
 * path of the copy on this machine.
 */
import { createClient } from "@supabase/supabase-js";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import sharp from "sharp";
import {
  type CatalogueRow,
  type SheetRow,
  cleanLink,
  linkKey,
  matchSheet,
  nextCode,
  sheetPlacement,
  sheetUnit,
} from "../lib/masters/catalogue-sheet";
import { isCommit, literal, requireProjectRef, serviceRoleKey, sql } from "./supabase-management";

const SHEET_NAME = "MAIN CATALOGUE";
const BUCKET = "catalogue";
/** The same thumbnail fetch-catalogue-images.ts makes, so every tile looks alike. */
const THUMB_PX = 300;
const THUMB_QUALITY = 78;
/** The picture opened from a line — no vendor page holds these, so they are ours. */
const FULL_PX = 1200;
const FULL_QUALITY = 82;
const CONCURRENCY = 4;

/** Header text (upper case, spaces collapsed) → the field it fills. */
const HEADERS = {
  "ITEM CODE": "code",
  "ITEM CATEGORY": "placement",
  "ITEM TYPE": "type",
  ITEM: "name",
  "ITEM DESCRIPTION": "description",
  "LINK / IMAGE": "link",
  "ITEM BRAND": "brand",
  REMARK: "remark",
  "ARTICLE NO": "articleNo",
  UNIT: "unit",
  "PRICE (INCL GST) / UNIT": "price",
} as const;
type Field = (typeof HEADERS)[keyof typeof HEADERS];

// --- The workbook ----------------------------------------------------------
// An .xlsx is a zip of XML parts. fflate (already a dependency, for Dexter)
// opens it; the parts are regular enough that a few patterns read them.

type Parts = Record<string, Uint8Array>;

function xml(parts: Parts, path: string): string {
  const part = parts[path];
  if (!part) throw new Error(`The workbook has no ${path}`);
  return strFromU8(part);
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

/** A part's relationships: id → absolute part path (or URL, for hyperlinks). */
function relationships(parts: Parts, partPath: string): Map<string, string> {
  const relsPath = posix.join(posix.dirname(partPath), "_rels", `${posix.basename(partPath)}.rels`);
  const out = new Map<string, string>();
  if (!parts[relsPath]) return out;
  for (const match of xml(parts, relsPath).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(match[1])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(match[1])?.[1];
    if (!id || target === undefined) continue;
    const external = /TargetMode="External"/.test(match[1]);
    const value = unescapeXml(target);
    out.set(
      id,
      external
        ? value
        : value.startsWith("/")
          ? value.slice(1)
          : posix.normalize(posix.join(posix.dirname(partPath), value)),
    );
  }
  return out;
}

function textRuns(fragment: string): string {
  return unescapeXml(
    [...fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""),
  );
}

type Sheet = {
  cells: Map<number, Map<string, string>>;
  links: Map<string, string>;
  pictures: Map<number, { column: number; media: string }[]>;
};

function readSheet(parts: Parts, name: string): Sheet {
  const workbook = xml(parts, "xl/workbook.xml");
  const sheetTag = [...workbook.matchAll(/<sheet\b([^>]*)\/>/g)].find(
    (m) => unescapeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? "").trim() === name,
  );
  const relId = sheetTag && /\br:id="([^"]+)"/.exec(sheetTag[1])?.[1];
  const sheetPath = relId && relationships(parts, "xl/workbook.xml").get(relId);
  if (!sheetPath) throw new Error(`No sheet called "${name}" in the workbook`);

  const shared = parts["xl/sharedStrings.xml"]
    ? [...xml(parts, "xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        textRuns(m[1]),
      )
    : [];

  const body = xml(parts, sheetPath);
  const cells = new Map<number, Map<string, string>>();
  for (const rowMatch of body.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = new Map<string, string>();
    for (const cell of rowMatch[2].matchAll(
      /<c\b[^>]*\br="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const type = /\bt="([^"]+)"/.exec(cell[2])?.[1];
      const inner = cell[3] ?? "";
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value: string | undefined;
      if (type === "s" && raw !== undefined) value = shared[Number(raw)];
      else if (type === "inlineStr") value = textRuns(inner);
      else if (raw !== undefined) value = unescapeXml(raw);
      if (value !== undefined) row.set(cell[1], value);
    }
    cells.set(Number(rowMatch[1]), row);
  }

  const sheetRels = relationships(parts, sheetPath);
  const links = new Map<string, string>();
  for (const match of body.matchAll(/<hyperlink\b([^>]*)\/>/g)) {
    const ref = /\bref="([A-Z]+\d+)/.exec(match[1])?.[1];
    const id = /\br:id="([^"]+)"/.exec(match[1])?.[1];
    const url = id && sheetRels.get(id);
    if (ref && url) links.set(ref, url);
  }

  // Pictures float over the sheet, anchored to the cell their top-left
  // corner sits in — that cell's row is the item they belong to.
  const pictures = new Map<number, { column: number; media: string }[]>();
  for (const drawingMatch of body.matchAll(/<drawing\b[^>]*\br:id="([^"]+)"/g)) {
    const drawingPath = sheetRels.get(drawingMatch[1]);
    if (!drawingPath) continue;
    const drawingRels = relationships(parts, drawingPath);
    for (const anchor of xml(parts, drawingPath).matchAll(
      /<xdr:(twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/xdr:\1>/g,
    )) {
      const from = /<xdr:from><xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(
        anchor[2],
      );
      const embed = /\br:embed="([^"]+)"/.exec(anchor[2])?.[1];
      const media = embed && drawingRels.get(embed);
      if (!from || !media || !parts[media]) continue;
      const row = Number(from[2]) + 1;
      const list = pictures.get(row) ?? [];
      list.push({ column: Number(from[1]), media });
      pictures.set(row, list);
    }
  }
  return { cells, links, pictures };
}

const columnIndex = (letters: string) =>
  [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function sheetRows(sheet: Sheet): SheetRow[] {
  const header = [...sheet.cells].find(([, row]) =>
    [...row.values()].some((v) => v.trim().toUpperCase() === "ITEM DESCRIPTION"),
  );
  if (!header) throw new Error(`No header row (one with "ITEM DESCRIPTION") in ${SHEET_NAME}`);
  const [headerRow, headerCells] = header;

  const columnOf = new Map<Field, string>();
  for (const [column, value] of headerCells) {
    const key = value.replace(/\s+/g, " ").trim().toUpperCase() as keyof typeof HEADERS;
    if (key in HEADERS) columnOf.set(HEADERS[key], column);
  }
  const missing = Object.entries(HEADERS)
    .filter(([, field]) => !columnOf.has(field))
    .map(([headerText]) => headerText);
  if (missing.length > 0) {
    throw new Error(`${SHEET_NAME} is missing the column(s): ${missing.join(", ")}`);
  }
  const linkColumn = columnOf.get("link")!;

  const rows: SheetRow[] = [];
  for (const [number, cells] of sheet.cells) {
    if (number <= headerRow) continue;
    const get = (field: Field) => {
      const value = cells.get(columnOf.get(field)!)?.trim();
      return value ? value : null;
    };
    if (!get("description") && !get("name")) continue;
    const linkText = get("link");
    const price = Number(get("price"));
    const pictures = (sheet.pictures.get(number) ?? [])
      // The picture in the LINK / IMAGE column first; strays after.
      .sort(
        (a, b) =>
          Number(b.column === columnIndex(linkColumn)) -
          Number(a.column === columnIndex(linkColumn)),
      )
      .map((p) => p.media);
    rows.push({
      row: number,
      code: get("code"),
      placement: get("placement"),
      type: get("type"),
      name: get("name")?.replace(/\s+/g, " ") ?? null,
      description: get("description"),
      link:
        sheet.links.get(`${linkColumn}${number}`) ??
        (linkText && /^https?:\/\//i.test(linkText) ? linkText : null),
      brand: get("brand")?.replace(/\s+/g, " ") ?? null,
      remark: get("remark"),
      articleNo: get("articleNo"),
      unit: get("unit"),
      price: get("price") !== null && Number.isFinite(price) ? price : null,
      pictures,
    });
  }
  return rows.sort((a, b) => a.row - b.row);
}

// --- The database ------------------------------------------------------------

type ItemRow = CatalogueRow & {
  name: string;
  image_url: string | null;
  thumb_url: string | null;
};

async function loadItems(ref: string): Promise<ItemRow[]> {
  return sql<ItemRow>(
    ref,
    `select i.id, i.code, i.name, i.description, b.name as brand, i.source_url,
            i.image_url, i.thumb_url, i.indicative_price::float8 as indicative_price
       from items i
       left join brands b on b.id = i.brand_id
      where i.kind = 'catalogue'
      order by i.code nulls last, i.created_at, i.id`,
  );
}

const lower = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// --- Pictures ----------------------------------------------------------------

async function uploadPicture(
  storage: ReturnType<typeof createClient>["storage"],
  itemId: string,
  bytes: Uint8Array,
): Promise<{ thumb_url: string; image_url: string }> {
  const source = sharp(bytes).rotate();
  const [thumb, full] = await Promise.all([
    source
      .clone()
      .resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer(),
    source
      .clone()
      .resize(FULL_PX, FULL_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: FULL_QUALITY })
      .toBuffer(),
  ]);
  const urls: string[] = [];
  for (const [path, buffer] of [
    [`items/${itemId}.webp`, thumb],
    [`items/${itemId}-full.webp`, full],
  ] as const) {
    // A Blob, never a raw Buffer (BUGCATCHER #1).
    const blob = new Blob([new Uint8Array(buffer)], { type: "image/webp" });
    const { error } = await storage
      .from(BUCKET)
      .upload(path, blob, { contentType: "image/webp", upsert: true });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
    urls.push(storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return { thumb_url: urls[0], image_url: urls[1] };
}

// --- Main --------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);
  const xlsxAt = argv.indexOf("--xlsx");
  const xlsxPath = xlsxAt === -1 ? undefined : argv[xlsxAt + 1];
  if (!xlsxPath || xlsxPath.startsWith("--")) {
    throw new Error("--xlsx <path to the catalogue workbook> is required");
  }

  console.log(
    commit
      ? `\n=== COMMIT RUN against ${ref} — this writes ===\n`
      : `\n=== DRY RUN against ${ref} — nothing will be written ===\n`,
  );

  const parts = unzipSync(new Uint8Array(readFileSync(xlsxPath)));
  const rows = sheetRows(readSheet(parts, SHEET_NAME));
  console.log(
    `Read ${rows.length} rows from "${SHEET_NAME}": ${rows.filter((r) => r.link).length} with a link, ` +
      `${rows.filter((r) => r.pictures.length).length} with a picture.`,
  );

  const [items, codes, categories, brands, uoms] = await Promise.all([
    loadItems(ref),
    sql<{ code: string }>(ref, "select code from items where code is not null"),
    sql<{ name: string }>(ref, "select name from item_categories where kind = 'catalogue'"),
    sql<{ name: string }>(ref, "select name from brands"),
    sql<{ name: string }>(ref, "select name from uoms"),
  ]);
  console.log(`The toolbox has ${items.length} catalogue items.\n`);

  const { matched, copies, fresh } = matchSheet(rows, items);

  // --- What would change on existing items --------------------------------
  const pictureTargets = matched.filter(
    (m) => m.row.pictures.length > 0 && !m.item.thumb_url && !m.item.image_url,
  );
  const linkTargets = matched
    .filter((m) => m.row.link && !m.item.source_url)
    .map((m) => ({ id: m.item.id, source_url: cleanLink(m.row.link)! }));

  // --- New items -------------------------------------------------------------
  const errors: string[] = [];
  const taken = new Set(codes.map((c) => c.code));
  const categoryByKey = new Map(categories.map((c) => [lower(c.name), c.name]));
  const brandByKey = new Map(brands.map((b) => [lower(b.name), b.name]));
  const uomNames = new Set(uoms.map((u) => u.name));
  const newCategories = new Map<string, string>();
  const newBrands = new Map<string, string>();

  const inserts = fresh.map((row) => {
    const where = `row ${row.row}${row.code ? ` (${row.code})` : ""}`;
    const unit = sheetUnit(row.unit);
    if (!unit || !uomNames.has(unit)) errors.push(`${where}: unit "${row.unit}" has no match`);
    if (!row.type) errors.push(`${where}: blank ITEM TYPE — no category to put it in`);
    const type = (row.type ?? "").replace(/\s+/g, " ").trim();
    const category = categoryByKey.get(lower(type)) ?? newCategories.get(lower(type)) ?? type;
    if (type && !categoryByKey.has(lower(type))) newCategories.set(lower(type), type);
    const brand = row.brand
      ? (brandByKey.get(lower(row.brand)) ?? newBrands.get(lower(row.brand)) ?? row.brand)
      : null;
    if (brand && !brandByKey.has(lower(brand))) newBrands.set(lower(brand), brand);
    // "console" and "cot" in the sheet read as "Console" and "Cot" in a tile.
    const given = row.name ?? type;
    const name = given.charAt(0).toUpperCase() + given.slice(1);
    return {
      row,
      code: nextCode(name, type, taken),
      name,
      description: row.description,
      category,
      brand,
      placement: sheetPlacement(row.placement),
      default_uom: unit ?? "each",
      // Whole rupees, as every price the first import stored.
      indicative_price: row.price === null ? null : Math.round(row.price),
      source_url: cleanLink(row.link),
    };
  });

  // Close to something the toolbox has, by the founder's rule still new.
  // Listed so a person can look — Masters can switch one off.
  const byLink = new Map<string, ItemRow>();
  for (const item of items) if (item.source_url) byLink.set(linkKey(item.source_url), item);
  const matchedIds = new Set(matched.map((m) => m.item.id));
  const unmatchedItems = items.filter((i) => !matchedIds.has(i.id));
  const nearly = inserts.flatMap((insert) => {
    const sameLink = insert.row.link ? byLink.get(linkKey(insert.row.link)) : undefined;
    const samePrice = unmatchedItems.find(
      (i) =>
        lower(i.brand) === lower(insert.brand) &&
        insert.indicative_price !== null &&
        Math.round(i.indicative_price ?? -1) === insert.indicative_price,
    );
    const near = sameLink ?? samePrice;
    return near
      ? [{ insert, near, why: sameLink ? "same product link" : "same brand and price" }]
      : [];
  });

  // --- Report ----------------------------------------------------------------
  const byRule = new Map<string, number>();
  for (const m of matched) byRule.set(m.rule, (byRule.get(m.rule) ?? 0) + 1);
  console.log(`Rows that are items the toolbox already has: ${matched.length}`);
  for (const [rule, count] of byRule) console.log(`    ${String(count).padStart(5)}  ${rule}`);
  console.log(
    `Rows that repeat an earlier row's product (skipped): ${copies.length}` +
      (copies.length ? ` — rows ${copies.map((c) => `${c.row.row} (= ${c.of})`).join(", ")}` : ""),
  );
  console.log(`Rows that become new items: ${inserts.length}`);
  console.log(
    `Existing items not in the sheet, left as they are: ${unmatchedItems.length}` +
      (unmatchedItems.length ? ` — ${unmatchedItems.map((i) => i.code ?? i.name).join(", ")}` : ""),
  );
  console.log(`\nPictures to add to existing items: ${pictureTargets.length}`);
  console.log(
    `Existing items keeping their own picture (the sheet's is not used): ${
      matched.filter((m) => m.row.pictures.length > 0 && (m.item.thumb_url || m.item.image_url))
        .length
    }`,
  );
  console.log(
    `Pictures for the new items: ${inserts.filter((i) => i.row.pictures.length > 0).length}`,
  );
  console.log(`Links to add to existing items: ${linkTargets.length}`);
  console.log(`New categories: ${[...newCategories.values()].join(", ") || "none"}`);
  console.log(`New brands: ${[...newBrands.values()].join(", ") || "none"}`);

  console.log("\nNew items:");
  for (const i of inserts) {
    const has = [i.row.pictures.length ? "picture" : "", i.source_url ? "link" : ""]
      .filter(Boolean)
      .join(" + ");
    console.log(
      `  row ${String(i.row.row).padStart(4)}  ${i.code.padEnd(8)} ${i.name} · ${i.brand ?? "no brand"} · ` +
        `${i.indicative_price === null ? "no price" : `₹${i.indicative_price}`} · ${has || "no picture or link"}` +
        ` — ${(i.description ?? "").replace(/\s+/g, " ").slice(0, 60)}`,
    );
  }
  if (nearly.length > 0) {
    console.log("\nNew, but close to an existing item — worth a glance:");
    for (const { insert, near, why } of nearly) {
      console.log(
        `  row ${insert.row.row} ${insert.code} "${(insert.description ?? insert.name).slice(0, 50)}" ₹${insert.indicative_price}` +
          `  ~ ${near.code} "${(near.description ?? near.name).slice(0, 50)}" ₹${near.indicative_price} (${why})`,
      );
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} problem(s) — nothing was written:`);
    for (const message of errors) console.error(`  ${message}`);
    process.exit(1);
  }
  if (!commit) {
    console.log("\nDry run — nothing written. Re-run with --commit to apply.\n");
    return;
  }

  // --- Write: items and links, in one transaction -------------------------------
  if (inserts.length > 0 || linkTargets.length > 0) {
    const statements: string[] = [];
    for (const category of newCategories.values()) {
      statements.push(
        `insert into item_categories (name, kind)
         select ${literal(category)}, 'catalogue'
         where not exists (select 1 from item_categories where lower(name) = lower(${literal(category)}) and kind = 'catalogue');`,
      );
    }
    for (const brand of newBrands.values()) {
      statements.push(
        `insert into brands (name)
         select ${literal(brand)}
         where not exists (select 1 from brands where lower(btrim(name)) = lower(${literal(brand)}));`,
      );
    }
    if (inserts.length > 0) {
      const payload = JSON.stringify(
        inserts.map((i) => ({
          code: i.code,
          name: i.name,
          description: i.description,
          category: i.category,
          brand: i.brand,
          placement: i.placement,
          default_uom: i.default_uom,
          indicative_price: i.indicative_price,
          source_url: i.source_url,
        })),
      );
      // Categories and brands resolve by name inside the statement; the
      // `not exists` makes a re-run of a half-finished write harmless.
      statements.push(
        `insert into items (code, name, description, kind, category_id, brand_id, placement,
                            default_uom, indicative_price, source_url, is_active, is_provisional)
         select r.code, r.name, r.description, 'catalogue', c.id,
                (select b.id from brands b where lower(btrim(b.name)) = lower(r.brand) order by b.name limit 1),
                r.placement, r.default_uom, r.indicative_price, r.source_url, true, false
         from jsonb_to_recordset(${literal(payload)}::jsonb)
           as r(code text, name text, description text, category text, brand text, placement text,
                default_uom text, indicative_price numeric, source_url text)
         join item_categories c on lower(c.name) = lower(r.category) and c.kind = 'catalogue'
         where not exists (select 1 from items i where i.code = r.code);`,
      );
    }
    if (linkTargets.length > 0) {
      statements.push(
        `update items i set source_url = r.source_url
         from jsonb_to_recordset(${literal(JSON.stringify(linkTargets))}::jsonb) as r(id uuid, source_url text)
         where i.id = r.id and i.source_url is null;`,
      );
    }
    await sql(ref, `begin;\n${statements.join("\n")}\ncommit;`);
    console.log(`\nWrote ${inserts.length} new item(s) and ${linkTargets.length} link(s).`);
  }

  // --- Write: pictures -----------------------------------------------------------
  // Matched again against the database as it now is, so the new items have
  // their ids — and so a run interrupted here resumes where it stopped.
  const again = matchSheet(rows, await loadItems(ref));
  if (again.fresh.length > 0) {
    console.error(
      `\n${again.fresh.length} row(s) still have no item after the write — stopping before pictures.`,
    );
    process.exit(1);
  }
  const todo = again.matched.filter(
    (m) => m.row.pictures.length > 0 && !m.item.thumb_url && !m.item.image_url,
  );
  if (todo.length === 0) {
    console.log("\nNo pictures to add.\n");
    return;
  }

  const storage = createClient(`https://${ref}.supabase.co`, await serviceRoleKey(ref), {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;

  let done = 0;
  const failures: string[] = [];
  for (let start = 0; start < todo.length; start += CONCURRENCY * 6) {
    const batch = todo.slice(start, start + CONCURRENCY * 6);
    const updates: { id: string; thumb_url: string; image_url: string }[] = [];
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      await Promise.all(
        batch.slice(i, i + CONCURRENCY).map(async ({ row, item }) => {
          try {
            const urls = await uploadPicture(storage, item.id, parts[row.pictures[0]]);
            updates.push({ id: item.id, ...urls });
          } catch (error) {
            failures.push(
              `row ${row.row}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }),
      );
    }
    if (updates.length > 0) {
      await sql(
        ref,
        `update items i set thumb_url = r.thumb_url, image_url = r.image_url
         from jsonb_to_recordset(${literal(JSON.stringify(updates))}::jsonb)
           as r(id uuid, thumb_url text, image_url text)
         where i.id = r.id and i.thumb_url is null and i.image_url is null;`,
      );
    }
    done += updates.length;
    process.stdout.write(`\r  pictures ${done}/${todo.length}  failed ${failures.length}   `);
  }
  console.log(`\n\nDone. ${done} picture(s) added.`);
  if (failures.length > 0) {
    console.log("Failed (re-run to retry — finished ones are skipped):");
    for (const failure of failures) console.log(`  ${failure}`);
  }
  console.log("Re-run without --commit: it should report nothing to write.\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
