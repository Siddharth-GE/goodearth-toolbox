// Match sheet rows to items on what describes the product, never the code: the sheet's code is a formula, so inserting a row renumbers the rest.
// Small differences mean a separate item; a wrong merge would put one product's picture on another.

export type SheetRow = {
  row: number;
  code: string | null;
  placement: string | null;
  type: string | null;
  name: string | null;
  description: string | null;
  link: string | null;
  brand: string | null;
  remark: string | null;
  articleNo: string | null;
  unit: string | null;
  price: number | null;
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
  copies: { row: SheetRow; of: number }[];
  fresh: SheetRow[];
};

const text = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[×✕]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const rupees = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "" : String(Math.round(value));

/** Host without www, path, no query: /product/ and /products/ are the same page. */
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

const TRACKING = /^(_gl|_pos|_sid|_ss|_fid|_psq|gclid|gbraid|wbraid|fbclid|utm_.*)$/i;

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
      // Same product page, brand and price with a rewritten description is the same product.
      name: "same link, brand and price",
      sheet: (r) =>
        withAll(linkKey(r.link), rupees(r.price)) &&
        `${linkKey(r.link)}#${text(r.brand)}#${rupees(r.price)}`,
      item: (i) =>
        withAll(linkKey(i.source_url), rupees(i.indicative_price)) &&
        `${linkKey(i.source_url)}#${text(i.brand)}#${rupees(i.indicative_price)}`,
    },
    {
      // Rows with no description: without this rule they would be added again on every run.
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
 * Strongest rule first, one to one. Twins with the same key pair by price, then by order (items arrive sorted by code).
 * A row left over falls to the next rule, and past the last it is new.
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

  // A repeat is identical to an earlier row, or has the same page, brand and price.
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

/** The sheet's prefix formula, then the next number the toolbox has not used for it. */
export function nextCode(name: string, type: string, taken: Set<string>): string {
  const squash = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const prefix = squash(name).slice(0, 3) + squash(type).slice(0, 1);
  // Three digits only: broken sheet rows (CHAIS2732) must not drag numbering to 2,733.
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

/** Blank unit means one of something, like every existing catalogue item. */
export function sheetUnit(unit: string | null): string | undefined {
  const key = text(unit).replace(/[.\s]/g, "");
  if (key === "" || key === "no" || key === "nos" || key === "each") return "each";
  if (key === "sft" || key === "sqft") return "sqft";
  if (key === "rft") return "rft";
  return undefined;
}

export function sheetPlacement(value: string | null): string | null {
  const key = text(value);
  if (key === "loose") return "loose";
  if (key === "fixed") return "fixed";
  if (key === "soft furnishing" || key === "soft furnishings") return "soft_furnishing";
  return null;
}
