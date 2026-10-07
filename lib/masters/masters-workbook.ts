// The founder's final masters workbook (Masters.xlsx, 2026-10-06) as clean
// lists — the pure half of scripts/import-masters-workbook.ts, kept here so
// every cleaning rule is tested (the script reads the file and writes; this
// decides). Five sheets are read: vendors and contractors, works with their
// labour rates, material categories, materials and construction stages.
// "Project IDs" is not: reorganising projects and plots is its own step.
//
// DECIDED WITH THE FOUNDER, 2026-10-07:
//   - A name the vendor sheet repeats is one vendor (Rasheed K is listed
//     five times); its ticks and details are pooled. Names that only look
//     alike stay apart — Santhosh K / K Santhosh, C Saju / Saju C,
//     Prabhakaran M / Prabhakaran, Rijesh / Rijesh K P, Madhu / Madhu M A,
//     GeoBricks / Geo Bricks — for Masters to merge if they are one party.
//   - A company, not a person: "Mr. Abhilash, Havells India" is Havells
//     India with Abhilash as the contact, and "Varun Vijayan" is Legrand's
//     territory manager. Branz Hexa loses its "2025-2026".
//   - Work names lose their "FD - " style prefix — the category already
//     shows it, as in the first works import — and "Moiner" is "Monier".
//
// Where the works sheet contradicts itself (two things under one code, a
// heading with no code, a heading listed as a work) the fix is spelled out
// in the tables below, each matched on the sheet's own code AND text, so a
// later edit to the sheet fails loudly instead of being fixed wrongly.

export type Cell = string | undefined;

/** One spreadsheet row: its 1-based number and its cells by column (A = 0). */
export type SheetRow = { row: number; cells: Cell[] };

function text(cell: Cell): string {
  return (cell ?? "").replace(/\s+/g, " ").trim();
}

function orNull(cell: Cell): string | null {
  const value = text(cell);
  return value === "" ? null : value;
}

/** An address: each line tidied, blank lines dropped, line breaks kept. */
function lines(cell: Cell): string | null {
  const value = (cell ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return value === "" ? null : value;
}

const money = (value: number) => Math.round(value * 100) / 100;

/** Letters and digits only, lower case — "Pvt.Ltd" and "Pvt. Ltd." agree. */
export function looseKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function number(cell: Cell, where: string): number | null {
  const value = text(cell);
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${where}: "${value}" is not a price.`);
  }
  return money(parsed);
}

/** The rows under the header, after checking the header is the one the rules were written for. */
function underHeader(rows: SheetRow[], sheet: string, expected: string[]): SheetRow[] {
  const header = rows.find((r) => r.cells.some((c) => text(c) !== ""));
  const matches =
    header !== undefined &&
    expected.every((label, i) => text(header.cells[i]).toLowerCase() === label.toLowerCase());
  if (!header || !matches) {
    throw new Error(
      `The "${sheet}" sheet no longer starts with the columns ${expected.join(", ")} — the importer was written for that layout.`,
    );
  }
  return rows.filter((r) => r.row > header.row);
}

// ---------------------------------------------------------------------------
// Vendors and contractors
// ---------------------------------------------------------------------------

export const VENDOR_COLUMNS = [
  "Sl. No.",
  "Name",
  "Business Address",
  "Name",
  "Mobile Number",
  "Designation",
  "Email",
  "MATERIAL",
  "SUBCONTRACTOR",
  "GSTIN Number",
  "GST State",
  "Pan Number",
  "Bank Name",
  "Account Number",
  "Account Holder Name",
  "IFSC",
];

export const VENDOR_DETAILS = [
  "contact_name",
  "contact_designation",
  "mobile",
  "email",
  "gst_no",
  "gst_state",
  "address",
] as const;
export type VendorDetail = (typeof VENDOR_DETAILS)[number];

export type BankDetails = {
  bank_name: string | null;
  account_number: string | null;
  account_holder_name: string | null;
  ifsc: string | null;
};

export type WorkbookVendor = {
  name: string;
  /** Every spelling the sheet used, before any tidy-up — what an existing vendor is matched on. */
  sheetNames: string[];
  rows: number[];
  is_contractor: boolean;
  bank: BankDetails | null;
} & Record<VendorDetail, string | null>;

const VENDOR_LEFT_OUT = new Set(["demo vendor"]);

const VENDOR_TIDY: Record<string, Partial<Record<"name" | VendorDetail, string | null>>> = {
  "mr. abhilash, havells india": { name: "Havells India", contact_name: "Abhilash" },
  // The sheet's address cell holds his card: "Territory Manager-Projects,
  // Legrand, Ph-8606071533".
  "varun vijayan": {
    name: "Legrand",
    contact_name: "Varun Vijayan",
    contact_designation: "Territory Manager-Projects",
    mobile: "8606071533",
    address: null,
  },
  "branz hexa india pvt. ltd. 2025-2026": { name: "Branz Hexa India Pvt. Ltd." },
  // A cut-off name: the row's GST number, address, contact and bank account
  // are PeeCee Traders', and so is its account holder name.
  peec: { name: "PeeCee Traders" },
};

export function vendorsFromSheet(rows: SheetRow[]): { vendors: WorkbookVendor[]; notes: string[] } {
  const notes: string[] = [];
  const byName = new Map<string, WorkbookVendor>();

  for (const { row, cells } of underHeader(rows, "Vendor & Contractor Names", VENDOR_COLUMNS)) {
    const sheetName = text(cells[1]);
    if (sheetName === "") continue;
    if (VENDOR_LEFT_OUT.has(sheetName.toLowerCase())) {
      notes.push(`Row ${row}: "${sheetName}" left out — a test row.`);
      continue;
    }
    if (text(cells[11]) !== "") {
      throw new Error(`Row ${row}: a PAN number — the vendors master has nowhere to keep one yet.`);
    }
    if (text(cells[7]).toLowerCase() !== "yes" && text(cells[8]).toLowerCase() !== "yes") {
      notes.push(
        `Row ${row}: "${sheetName}" is ticked neither material nor subcontractor — kept as a supplier.`,
      );
    }

    const { name: tidyName, ...tidyDetails } = VENDOR_TIDY[sheetName.toLowerCase()] ?? {};
    const name = tidyName ?? sheetName;
    const details: Record<VendorDetail, string | null> = {
      contact_name: orNull(cells[3]),
      contact_designation: orNull(cells[5]),
      mobile: orNull(cells[4]),
      email: orNull(cells[6]),
      gst_no: orNull(cells[9]),
      gst_state: orNull(cells[10]),
      address: lines(cells[2]),
      ...tidyDetails,
    };
    const bank: BankDetails = {
      bank_name: orNull(cells[12]),
      account_number: orNull(cells[13]),
      account_holder_name: orNull(cells[14]),
      ifsc: orNull(cells[15]),
    };
    const hasBank = Object.values(bank).some((value) => value !== null);
    const contractor = text(cells[8]).toLowerCase() === "yes";

    const known = byName.get(name.toLowerCase());
    if (!known) {
      byName.set(name.toLowerCase(), {
        name,
        sheetNames: [sheetName],
        rows: [row],
        is_contractor: contractor,
        bank: hasBank ? bank : null,
        ...details,
      });
      continue;
    }

    // A repeat: pool what the rows say; the first row to say something wins.
    known.rows.push(row);
    if (!known.sheetNames.includes(sheetName)) known.sheetNames.push(sheetName);
    known.is_contractor ||= contractor;
    for (const field of VENDOR_DETAILS) {
      const value = details[field];
      if (value === null) continue;
      if (known[field] === null) known[field] = value;
      else if (known[field] !== value) {
        notes.push(`${name}: rows disagree on ${field} — kept row ${known.rows[0]}'s.`);
      }
    }
    if (hasBank) {
      if (known.bank === null) known.bank = bank;
      else if (JSON.stringify(known.bank) !== JSON.stringify(bank)) {
        notes.push(`${name}: rows give two different bank accounts — kept the first.`);
      }
    }
  }

  const vendors = [...byName.values()];
  for (const vendor of vendors) {
    if (vendor.rows.length > 1) {
      notes.push(
        `${vendor.name}: listed ${vendor.rows.length} times (rows ${vendor.rows.join(", ")}) — one vendor.`,
      );
    }
  }
  return { vendors, notes };
}

// ---------------------------------------------------------------------------
// Works
// ---------------------------------------------------------------------------

export type WorkbookWorkCategory = { code: string; name: string; sort_order: number };
export type WorkbookWorkGroup = {
  code: string;
  category: string;
  name: string;
  sort_order: number;
};
export type WorkbookWorkItem = {
  code: string;
  category: string;
  group: string | null;
  name: string;
  sort_order: number;
  /** The rate book's unit and labour rate — null where the sheet gives none. */
  uom: string | null;
  labour_rate: number | null;
};

/** Section headings in the sheet that become groups → the group's code. */
const WORK_HEADINGS: { code: string; name: string; group: string }[] = [
  // No code in the sheet. FD.3 was this heading in the first works list;
  // the sheet's own FD.3 row repeats FD.6 and is left out (below).
  { code: "", name: "FD - Rubble Foundation", group: "FD.3" },
  { code: "FD.11", name: "FD - Isolated Foundation", group: "FD.11" },
  { code: "FD.18", name: "FD - Pile Foundation", group: "FD.18" },
  { code: "FD.24", name: "FD - Plinth Beam", group: "FD.24" },
  // The sheet gives this heading the category's own code.
  { code: "PF", name: "PF - Plastering", group: "PF.0" },
  // The sheet numbers this heading PF.2, which is already Bull Marking. It
  // follows PF.19, so it becomes PF.20 and its works PF.20a–PF.20s.
  { code: "PF.2", name: "PF - Roof Fabrication", group: "PF.20" },
  { code: "F.1", name: "F - Internal Finishing Works", group: "F.1" },
  { code: "F.2", name: "F - External Finishes", group: "F.2" },
];

/** Rows that are not works of their own. */
const WORK_LEFT_OUT: { code: string; name: string; why: string }[] = [
  { code: "FD.3", name: "FD - Dry Rubble Masonry", why: "repeats FD.6, which carries the rate" },
  {
    code: "F.1.1",
    name: "F - Polishing Works",
    why: "a heading — the works under it are the Wood Polishing ones",
  },
  {
    code: "F.1.7",
    name: "F - Floor Tiling",
    why: "a heading — each work under it is Floor Tiling with its scope",
  },
];

/** A work the sheet leaves without a code. */
const WORK_CODES: { code: string; name: string; becomes: string }[] = [
  { code: "", name: "MEP - Electrical Connection Checking", becomes: "MEP.11b" },
];

/** Where a group stops before the next heading, because what follows is a different kind of work. */
const GROUP_ENDS_BEFORE = new Set([
  "PF.16", // Screed is not Plastering
  "PF.20k", // Stair Fabrication onward is not Roof Fabrication
]);

/** Names the sheet repeats under different floors get the floor their parent row names. */
const FLOOR: Record<string, string> = {
  "SS.2a": "GF",
  "SS.2b": "GF",
  "SS.2c": "GF",
  "SS.2d": "GF",
  "SS.7b": "FF",
  "SS.7c": "FF",
  "SS.7d": "FF",
  "SS.7e": "FF",
  "SS.9a": "Attic",
  "MEP.2a": "GF",
  "MEP.3a": "FF",
};

const WORK_UOMS: Record<string, string> = {
  m3: "cum",
  sqft: "sqft",
  sft: "sqft",
  rft: "rft",
  nos: "nos",
  lumpsum: "lumpsum",
  pali: "pali",
  "per pali": "pali",
};

const same = (a: { code: string; name: string }, code: string, name: string) =>
  a.code === code && a.name === name;

export function worksFromSheet(rows: SheetRow[]): {
  categories: WorkbookWorkCategory[];
  groups: WorkbookWorkGroup[];
  items: WorkbookWorkItem[];
  notes: string[];
} {
  const categories: WorkbookWorkCategory[] = [];
  const groups: WorkbookWorkGroup[] = [];
  const items: WorkbookWorkItem[] = [];
  const notes: string[] = [];
  const used = new Set<object>();

  let category: WorkbookWorkCategory | null = null;
  let group: WorkbookWorkGroup | null = null;
  let order = 0;

  const cleanName = (name: string) => {
    let clean = name;
    for (const known of categories) {
      if (clean.startsWith(`${known.code} - `)) clean = clean.slice(known.code.length + 3);
    }
    return clean.replace(/\bMoiner\b/g, "Monier");
  };

  for (const { row, cells } of underHeader(rows, "Works", [
    "Code",
    "Work Description",
    "Scope",
    "Unit",
    "Price",
  ])) {
    const sheetCode = text(cells[0]);
    const sheetName = text(cells[1]);
    if (sheetCode === "" && sheetName === "") continue;
    order += 10;

    const heading = WORK_HEADINGS.find((h) => same(h, sheetCode, sheetName));
    const leftOut = WORK_LEFT_OUT.find((d) => same(d, sheetCode, sheetName));
    const recode = WORK_CODES.find((c) => same(c, sheetCode, sheetName));
    for (const rule of [heading, leftOut, recode]) if (rule) used.add(rule);

    const isCategory =
      !heading &&
      sheetCode !== "" &&
      !sheetCode.includes(".") &&
      !sheetName.startsWith(`${sheetCode} - `);
    if (isCategory) {
      category = { code: sheetCode, name: sheetName, sort_order: (categories.length + 1) * 10 };
      categories.push(category);
      group = null;
      if (text(cells[4]) !== "") {
        notes.push(
          `${sheetCode}: the sheet's ${text(cells[4])} is the whole stage's rate per sqft — its works carry their own shares, so it is not stored.`,
        );
      }
      continue;
    }
    if (!category) throw new Error(`Row ${row}: "${sheetName}" comes before any category.`);

    if (heading) {
      group = {
        code: heading.group,
        category: category.code,
        name: cleanName(sheetName),
        sort_order: order,
      };
      groups.push(group);
      continue;
    }
    if (leftOut) {
      notes.push(`Row ${row}: ${sheetCode} "${sheetName}" left out — ${leftOut.why}.`);
      continue;
    }

    const code = recode?.becomes ?? sheetCode.replace(/^PF\.2([a-z])$/, "PF.20$1");
    if (code === "") throw new Error(`Row ${row}: "${sheetName}" has no code.`);
    if (code.split(".")[0] !== category.code) {
      throw new Error(`Row ${row}: ${code} sits under category ${category.code}.`);
    }
    if (GROUP_ENDS_BEFORE.has(code)) group = null;

    const scope = text(cells[2]);
    const name =
      cleanName(sheetName) +
      (FLOOR[code] ? ` - ${FLOOR[code]}` : "") +
      (scope ? ` — ${scope}` : "");

    // The rate book: a unit, or a share of the stage's per-sqft rate (SS
    // and MEP write 0.12 in the unit column; the price is already the
    // share, 0.12 × 230 = 27.6 per sqft).
    const unit = text(cells[3]);
    const rate = number(cells[4], `Row ${row} (${code})`);
    let uom: string | null = null;
    if (unit !== "" && Number.isFinite(Number(unit))) uom = "sqft";
    else if (unit !== "") {
      uom = WORK_UOMS[unit.toLowerCase()] ?? null;
      if (!uom) throw new Error(`Row ${row} (${code}): unknown unit "${unit}".`);
    } else if (rate !== null) {
      throw new Error(`Row ${row} (${code}): a price with no unit.`);
    }

    items.push({
      code,
      category: category.code,
      group: group?.code ?? null,
      name,
      sort_order: order,
      uom,
      labour_rate: rate,
    });
  }

  for (const rule of [...WORK_HEADINGS, ...WORK_LEFT_OUT, ...WORK_CODES]) {
    if (!used.has(rule)) {
      throw new Error(
        `The works sheet no longer has ${rule.code || "(no code)"} "${rule.name}" — re-check the fixes in masters-workbook.ts.`,
      );
    }
  }

  const codes = new Set<string>();
  for (const entry of [...categories, ...groups, ...items]) {
    if (codes.has(entry.code)) throw new Error(`Works: ${entry.code} is used twice.`);
    codes.add(entry.code);
  }

  const seen = new Map<string, string>();
  for (const item of items) {
    const key = `${item.category}|${item.group}|${item.name.toLowerCase()}`;
    const first = seen.get(key);
    if (first)
      notes.push(
        `${first} and ${item.code} have the same name, "${item.name}" — kept both; rename one in Masters.`,
      );
    else seen.set(key, item.code);
  }

  return { categories, groups, items, notes };
}

// ---------------------------------------------------------------------------
// Material categories, materials, construction stages
// ---------------------------------------------------------------------------

export type WorkbookMaterialCategory = { code: string; name: string };
// The sheet's "Material Family" column is not kept: as a description it
// is mostly the name again or a fragment of it ("X", "Box").
export type WorkbookMaterial = {
  code: string;
  name: string;
  category: string;
  uom: string;
  indicative_price: number | null;
};

const MATERIAL_UOMS: Record<string, string> = {
  nos: "nos",
  no: "nos",
  sqft: "sqft",
  kg: "kg",
  cft: "cft",
  cum: "cum",
  bag: "bag",
  bags: "bag",
  set: "set",
  roll: "roll",
  box: "box",
  mtr: "mtr",
  m: "mtr",
  length: "length",
  pkt: "pkt",
  pack: "pkt",
  pk: "pkt",
  ltr: "litre",
  load: "load",
  pairs: "pair",
  bottle: "bottle",
};

/** Founder-settled for the first material master (2026-08-20): a blank unit is "nos". */
const BLANK_MATERIAL_UOM = "nos";

/** The Category sheet has no header: code in A, name in B. */
export function materialCategoriesFromSheet(rows: SheetRow[]): WorkbookMaterialCategory[] {
  const categories: WorkbookMaterialCategory[] = [];
  for (const { row, cells } of rows) {
    const code = text(cells[0]);
    const name = text(cells[1]);
    if (code === "" && name === "") continue;
    if (code === "" || name === "")
      throw new Error(`Category row ${row}: needs both a code and a name.`);
    if (categories.some((c) => c.code === code || c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Category row ${row}: ${code} ${name} is listed twice.`);
    }
    categories.push({ code, name });
  }
  return categories;
}

export function materialsFromSheet(
  rows: SheetRow[],
  categories: WorkbookMaterialCategory[],
): { materials: WorkbookMaterial[]; notes: string[] } {
  const materials: WorkbookMaterial[] = [];
  const notes: string[] = [];
  const codes = new Set<string>();
  const blankUnits: string[] = [];

  for (const { row, cells } of underHeader(rows, "Material Master", [
    "New Code",
    "Category",
    "Material Family",
    "Material / Specification",
    "UOM",
    "Rate",
  ])) {
    const code = text(cells[0]);
    const name = text(cells[3]);
    if (code === "" && name === "") continue;
    if (code === "" || name === "")
      throw new Error(`Material row ${row}: needs both a code and a name.`);
    if (codes.has(code)) throw new Error(`Material row ${row}: ${code} is used twice.`);
    codes.add(code);

    const category = categories.find((c) => c.name.toLowerCase() === text(cells[1]).toLowerCase());
    if (!category)
      throw new Error(
        `Material row ${row} (${code}): "${text(cells[1])}" is not on the Category sheet.`,
      );
    if (code.split("/")[0] !== category.code) {
      throw new Error(
        `Material row ${row}: ${code} is filed under ${category.name} (${category.code}).`,
      );
    }

    const unit = text(cells[4]).toLowerCase();
    const uom = unit === "" ? BLANK_MATERIAL_UOM : MATERIAL_UOMS[unit];
    if (!uom) throw new Error(`Material row ${row} (${code}): unknown unit "${text(cells[4])}".`);
    if (unit === "") blankUnits.push(code);

    materials.push({
      code,
      name,
      category: category.name,
      uom,
      indicative_price: number(cells[5], `Material row ${row} (${code})`),
    });
  }

  if (blankUnits.length > 0) {
    notes.push(`No unit in the sheet, so "${BLANK_MATERIAL_UOM}": ${blankUnits.join(", ")}.`);
  }
  const byName = new Map<string, string>();
  for (const m of materials) {
    const key = `${m.name.toLowerCase()}|${m.uom}`;
    const first = byName.get(key);
    if (first) notes.push(`${first} and ${m.code} are both "${m.name}" (${m.uom}) — kept both.`);
    else byName.set(key, m.code);
  }
  return { materials, notes };
}

/** The Stages sheet has no header: one stage per row, in order. */
export function stagesFromSheet(rows: SheetRow[]): string[] {
  const stages: string[] = [];
  for (const { row, cells } of rows) {
    const name = text(cells[0]);
    if (name === "") continue;
    if (stages.some((s) => s.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Stages row ${row}: "${name}" is listed twice.`);
    }
    stages.push(name);
  }
  return stages;
}
