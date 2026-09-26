// Matching the interiors catalogue spreadsheet to the items master — the
// pure half of scripts/import-catalogue-sheet.ts, kept here so it can be
// tested (the script reads the workbook and writes; this decides).
//
// WHY NOT MATCH ON THE CODE. The sheet's ITEM CODE column is a formula —
// UPPER(LEFT(item,3) & LEFT(type,1)) & a COUNTIFS running number — so
// inserting one row renumbers every row below it of the same kind. On
// 2026-09-26 about 1,000 of the sheet's 2,759 codes named a different
// product than the same code in the toolbox. A code is a label here, not
// an identity; a product is its description, brand, link and price.
//
// THE FOUNDER'S RULE (2026-09-26): "if there are small variations in some
// data they are probably not a duplicate". So a row joins an existing
// item only on an exact match of what describes the product, and anything
// that differs — a "3" added to a sofa's description, the same lamp at
// another price — becomes its own item. Masters can switch one off later;
// a wrong merge would silently put one product's picture on another.

export type SheetRow = {
  /** The spreadsheet row number, for the report. */
  row: number;
  /** The sheet's own code — shown, never trusted (see above). */
  code: string | null;
  /** ITEM CATEGORY: Loose / Fixed / SOFT FURNISHING. */
  placement: string | null;
  /** ITEM TYPE — the toolbox's item category. */
  type: string | null;
  name: string | null;
  description: string | null;
  link: string | null;
  brand: string | null;
  remark: string | null;
  articleNo: string | null;
  unit: string | null;
  price: number | null;
  /** Pictures pasted on the row, as paths inside the workbook. */
  pictures: string[];
};

export type CatalogueRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  source_url: string | null;
  indicative_price: number | null;
};

export type SheetMatch<T extends CatalogueRow> = {
  matched: { row: SheetRow; item: T; rule: string }[];
  /** Rows that repeat an earlier row's product — listed twice in the sheet. */
  copies: { row: SheetRow; of: number }[];
  /** Rows with no existing item: each becomes a new one. */
  fresh: SheetRow[];
};

const text = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[×✕]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/** Whole rupees, or "" when there is no price — the pairing key. */
const rupees = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "" : String(Math.round(value));

/**
 * A product link reduced to what identifies the product: host without
 * www, the path, no query. Whispering Homes moved from /product/ to
 * /products/ and redirects the old form, so both spell the same page.
 */
export function linkKey(url: string | null | undefined): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/\/+$/, "").replace(/^\/product\//, "/products/");
    return (parsed.host.replace(/^www\./, "") + path).toLowerCase();
  } catch {
    return text(raw);
  }
}

/** Parameters that only say where a click came from. */
const TRACKING = /^(_gl|_pos|_sid|_ss|_fid|_psq|gclid|gbraid|wbraid|fbclid|utm_.*)$/i;

/** The link as it is stored: tracking parameters removed, the rest kept. */
export function cleanLink(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    for (const name of [...parsed.searchParams.keys()]) {
      if (TRACKING.test(name)) parsed.searchParams.delete(name);
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

/** Every field that describes the product — two rows alike in all of them are one product. */
function fingerprint(row: SheetRow): string {
  return [
    text(row.name),
    text(row.description),
    text(row.brand),
    linkKey(row.link),
    rupees(row.price),
    text(row.unit),
    text(row.articleNo),
    text(row.remark),
  ].join("|");
}

type Rule<T> = {
  name: string;
  sheet: (row: SheetRow) => string;
  item: (item: T) => string;
};

function rules<T extends CatalogueRow>(): Rule<T>[] {
  const withAll = (...parts: string[]) => (parts.every(Boolean) ? parts.join("#") : "");
  return [
    {
      name: "same link, description and brand",
      sheet: (r) =>
        withAll(linkKey(r.link), text(r.description)) &&
        `${linkKey(r.link)}#${text(r.description)}#${text(r.brand)}`,
      item: (i) =>
        withAll(linkKey(i.source_url), text(i.description)) &&
        `${linkKey(i.source_url)}#${text(i.description)}#${text(i.brand)}`,
    },
    {
      name: "same description and brand",
      sheet: (r) => text(r.description) && `${text(r.description)}#${text(r.brand)}`,
      item: (i) => text(i.description) && `${text(i.description)}#${text(i.brand)}`,
    },
    {
      // The one exact-match rule without the description: the same product
      // page, brand and price with the description rewritten (Lunar Crystal
      // Wall Light, 2026-09-26). All three together are the product.
      name: "same link, brand and price",
      sheet: (r) =>
        withAll(linkKey(r.link), rupees(r.price)) &&
        `${linkKey(r.link)}#${text(r.brand)}#${rupees(r.price)}`,
      item: (i) =>
        withAll(linkKey(i.source_url), rupees(i.indicative_price)) &&
        `${linkKey(i.source_url)}#${text(i.brand)}#${rupees(i.indicative_price)}`,
    },
    {
      // Only for rows with no description at all, where nothing above can
      // apply — without it such a row would be added again on every run.
      name: "no description: same name, brand and price",
      sheet: (r) =>
        !text(r.description) && text(r.name)
          ? `${text(r.name)}#${text(r.brand)}#${rupees(r.price)}`
          : "",
      item: (i) =>
        !text(i.description) && text(i.name)
          ? `${text(i.name)}#${text(i.brand)}#${rupees(i.indicative_price)}`
          : "",
    },
  ];
}

/**
 * Pairs sheet rows with existing items, one to one, never reusing either
 * side. Rules run strongest first. Inside one rule, when several rows and
 * items share a key (twenty "Ashwood bench … By HOMEWORK." that differ
 * only in size), rows pair with the item at the same price first, then in
 * order — `items` should arrive sorted by code, which is the order the
 * original import gave them. A row left over once its twins are paired
 * falls through to the next rule, and past the last one it is new.
 */
export function matchSheet<T extends CatalogueRow>(rows: SheetRow[], items: T[]): SheetMatch<T> {
  const matchedRow = new Map<number, { item: T; rule: string }>();
  const usedItem = new Set<string>();

  for (const rule of rules<T>()) {
    const itemsByKey = new Map<string, T[]>();
    for (const item of items) {
      if (usedItem.has(item.id)) continue;
      const key = rule.item(item);
      if (!key) continue;
      const list = itemsByKey.get(key) ?? [];
      list.push(item);
      itemsByKey.set(key, list);
    }
    const rowsByKey = new Map<string, SheetRow[]>();
    for (const row of rows) {
      if (matchedRow.has(row.row)) continue;
      const key = rule.sheet(row);
      if (!key) continue;
      const list = rowsByKey.get(key) ?? [];
      list.push(row);
      rowsByKey.set(key, list);
    }

    for (const [key, group] of rowsByKey) {
      const free = [...(itemsByKey.get(key) ?? [])];
      if (free.length === 0) continue;
      const take = (row: SheetRow, index: number) => {
        const [item] = free.splice(index, 1);
        matchedRow.set(row.row, { item, rule: rule.name });
        usedItem.add(item.id);
      };
      if (group.length > 1 || free.length > 1) {
        for (const row of group) {
          const price = rupees(row.price);
          if (!price) continue;
          const index = free.findIndex((item) => rupees(item.indicative_price) === price);
          if (index !== -1) take(row, index);
        }
      }
      for (const row of group) {
        if (free.length === 0) break;
        if (!matchedRow.has(row.row)) take(row, 0);
      }
    }
  }

  // A row left over is a repeat when it is identical to an earlier row, or
  // names the same product page, brand and price as one — the identity the
  // third rule already trusts. The sheet has both: a block of 26 consoles
  // pasted twice, 19 of them identical and six with a corrected description.
  const matched: SheetMatch<T>["matched"] = [];
  const copies: SheetMatch<T>["copies"] = [];
  const fresh: SheetRow[] = [];
  const earlierRow = new Map<string, number>();
  const remember = (key: string, row: number) => {
    if (key && !earlierRow.has(key)) earlierRow.set(key, row);
  };
  const product = (link: string | null, brand: string | null, price: number | null) =>
    linkKey(link) && rupees(price)
      ? `product:${linkKey(link)}#${text(brand)}#${rupees(price)}`
      : "";
  for (const row of rows) {
    const hit = matchedRow.get(row.row);
    if (!hit) continue;
    matched.push({ row, item: hit.item, rule: hit.rule });
    remember(fingerprint(row), row.row);
    remember(product(row.link, row.brand, row.price), row.row);
    remember(product(hit.item.source_url, hit.item.brand, hit.item.indicative_price), row.row);
  }
  for (const row of rows) {
    if (matchedRow.has(row.row)) continue;
    const earlier =
      earlierRow.get(fingerprint(row)) ?? earlierRow.get(product(row.link, row.brand, row.price));
    if (earlier !== undefined) copies.push({ row, of: earlier });
    else {
      remember(fingerprint(row), row.row);
      remember(product(row.link, row.brand, row.price), row.row);
      fresh.push(row);
    }
  }
  return { matched, copies, fresh };
}

/**
 * The code a new item gets: the sheet's own formula for the prefix —
 * first three characters of the item, first of the type, upper case — and
 * the next number the toolbox has not used for that prefix. The sheet's
 * number cannot be used, for the reason at the top of this file.
 */
export function nextCode(name: string, type: string, taken: Set<string>): string {
  const squash = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const prefix = squash(name).slice(0, 3) + squash(type).slice(0, 1);
  // Three digits only: the sheet's broken rows carry codes like CHAIS2732
  // (a different formula), which must not drag the numbering to 2,733.
  const pattern = new RegExp(`^${prefix}(\\d{3})$`);
  let highest = 0;
  for (const code of taken) {
    const number = pattern.exec(code)?.[1];
    if (number) highest = Math.max(highest, Number(number));
  }
  let code = "";
  do code = `${prefix}${String(++highest).padStart(3, "0")}`;
  while (taken.has(code));
  taken.add(code);
  return code;
}

/** Sheet UNIT → uoms.name. Blank is one of something, as every existing catalogue item is. */
export function sheetUnit(unit: string | null): string | undefined {
  const key = text(unit).replace(/[.\s]/g, "");
  if (key === "" || key === "no" || key === "nos" || key === "each") return "each";
  if (key === "sft" || key === "sqft") return "sqft";
  if (key === "rft") return "rft";
  return undefined;
}

/** Sheet ITEM CATEGORY → items.placement. */
export function sheetPlacement(value: string | null): string | null {
  const key = text(value);
  if (key === "loose") return "loose";
  if (key === "fixed") return "fixed";
  if (key === "soft furnishing" || key === "soft furnishings") return "soft_furnishing";
  return null;
}
