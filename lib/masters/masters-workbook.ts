import { roundPaise } from "@/lib/line-money";
// Pure half of scripts/import-masters-workbook.ts: vendors and materials (the works are works-workbook.ts).
// A repeated vendor name is one vendor; look-alike names stay apart for Masters to merge.

export type Cell = string | undefined;

export type SheetRow = { row: number; cells: Cell[] };

function text(cell: Cell): string {
  return (cell ?? "").replace(/\s+/g, " ").trim();
}

function orNull(cell: Cell): string | null {
  const value = text(cell);
  return value === "" ? null : value;
}

function lines(cell: Cell): string | null {
  const value = (cell ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return value === "" ? null : value;
}

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
  return roundPaise(parsed);
}

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
  sheetNames: string[];
  rows: number[];
  is_contractor: boolean;
  bank: BankDetails | null;
} & Record<VendorDetail, string | null>;

const VENDOR_LEFT_OUT = new Set(["demo vendor"]);

const VENDOR_TIDY: Record<string, Partial<Record<"name" | VendorDetail, string | null>>> = {
  "mr. abhilash, havells india": { name: "Havells India", contact_name: "Abhilash" },
  // The address cell holds a Legrand territory manager's card, not an address.
  "varun vijayan": {
    name: "Legrand",
    contact_name: "Varun Vijayan",
    contact_designation: "Territory Manager-Projects",
    mobile: "8606071533",
    address: null,
  },
  "branz hexa india pvt. ltd. 2025-2026": { name: "Branz Hexa India Pvt. Ltd." },
  // A cut-off name: the row's GST, address, contact and bank belong to PeeCee Traders.
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

export type WorkbookMaterialCategory = { code: string; name: string };
// The Material Family column is dropped: mostly the name again.
export type WorkbookMaterial = {
  code: string;
  name: string;
  category: string;
  uom: string;
  indicative_price: number | null;
  /** Entered by hand in the sheet; null where the cell is blank, which keeps what Masters holds. */
  gst_pct: number | null;
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

/** "18%", "18" and Excel's percent cell (0.18) are the same 18. */
export function gstFromCell(cell: Cell, where: string): number | null {
  const value = text(cell).replace(/%$/, "").trim();
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)
    throw new Error(`${where}: "${text(cell)}" is not a GST rate.`);
  const pct = parsed > 0 && parsed < 1 && !text(cell).endsWith("%") ? parsed * 100 : parsed;
  return Math.round(pct * 100) / 100;
}

/** A blank unit is "nos". */
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
      gst_pct: gstFromCell(cells[6], `Material row ${row} (${code})`),
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
