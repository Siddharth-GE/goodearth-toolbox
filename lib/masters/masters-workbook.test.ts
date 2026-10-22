import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type SheetRow,
  VENDOR_COLUMNS,
  gstFromCell,
  looseKey,
  materialCategoriesFromSheet,
  materialsFromSheet,
  vendorsFromSheet,
} from "./masters-workbook";

const sheet = (header: string[] | null, body: (string | undefined)[][]): SheetRow[] => [
  ...(header ? [{ row: 1, cells: header }] : []),
  ...body.map((cells, i) => ({ row: i + (header ? 2 : 1), cells })),
];

// Vendor columns by index: 0 Sl, 1 Name, 2 Address, 3 Contact, 4 Mobile, 5 Designation, 6 Email, 7 MATERIAL,
// 8 SUBCONTRACTOR, 9 GSTIN, 10 GST State, 11 PAN, 12 Bank, 13 Account, 14 Holder, 15 IFSC.
const vendor = (name: string, fields: Record<number, string> = {}) => {
  const cells: (string | undefined)[] = Array(16).fill(undefined);
  cells[1] = name;
  for (const [at, value] of Object.entries(fields)) cells[Number(at)] = value;
  return cells;
};
const contractor = (name: string) => vendor(name, { 8: "Yes" });
const supplier = (name: string, fields: Record<number, string> = {}) =>
  vendor(name, { 7: "Yes", ...fields });
const vendors = (...rows: (string | undefined)[][]) =>
  vendorsFromSheet(sheet(VENDOR_COLUMNS, rows));

test("a name listed five times is one vendor", () => {
  const { vendors: list } = vendors(
    contractor("Rasheed K"),
    contractor("Rasheed K"),
    contractor("Sivakumar K P"),
    contractor("Rasheed K"),
  );
  assert.deepEqual(
    list.map((v) => [v.name, v.rows]),
    [
      ["Rasheed K", [2, 3, 5]],
      ["Sivakumar K P", [4]],
    ],
  );
});

test("Linse V is a contractor and a supplier: one vendor, the tick and the bank details pooled", () => {
  const { vendors: list } = vendors(
    contractor("Linse V"),
    supplier("Linse V", {
      12: "State Bank of India",
      13: "1234",
      14: "Linse V",
      15: "SBIN0000001",
    }),
  );
  assert.equal(list.length, 1);
  assert.equal(list[0].is_contractor, true);
  assert.deepEqual(list[0].bank, {
    bank_name: "State Bank of India",
    account_number: "1234",
    account_holder_name: "Linse V",
    ifsc: "SBIN0000001",
  });
});

test("names that only look alike stay apart — the founder merges those in Masters", () => {
  const { vendors: list } = vendors(
    contractor("Santhosh K"),
    contractor("K Santhosh"),
    contractor("C Saju"),
    contractor("Saju C"),
    supplier("GeoBricks"),
    supplier("Geo Bricks"),
  );
  assert.equal(list.length, 6);
});

test("the test row is left out, and a row with neither tick is kept and said", () => {
  const { vendors: list, notes } = vendors(
    vendor("Demo Vendor", { 7: "Yes", 8: "Yes" }),
    vendor("Prabhakaran", { 7: "No" }),
  );
  assert.deepEqual(
    list.map((v) => [v.name, v.is_contractor]),
    [["Prabhakaran", false]],
  );
  assert.ok(notes.some((n) => n.includes("Demo Vendor")));
  assert.ok(notes.some((n) => n.includes("neither")));
});

test("a company, not a person — and the person becomes the contact", () => {
  const { vendors: list } = vendors(
    supplier("Mr. Abhilash, Havells India"),
    supplier("Varun Vijayan", { 2: "Territory Manager-Projects\r\nLegrand\r\nPh-8606071533" }),
    supplier("Branz Hexa India Pvt. Ltd. 2025-2026"),
    supplier("PeeC", { 9: "32ADMPB0314R1ZP", 14: "PeeCee Traders" }),
  );
  const [havells, legrand, branz, peecee] = list;
  assert.equal(peecee.name, "PeeCee Traders");
  assert.equal(havells.name, "Havells India");
  assert.equal(havells.contact_name, "Abhilash");
  assert.deepEqual(havells.sheetNames, ["Mr. Abhilash, Havells India"]);
  assert.equal(legrand.name, "Legrand");
  assert.equal(legrand.contact_name, "Varun Vijayan");
  assert.equal(legrand.mobile, "8606071533");
  assert.equal(legrand.address, null);
  assert.equal(branz.name, "Branz Hexa India Pvt. Ltd.");
});

test("an address keeps its lines; spaces are tidied", () => {
  const { vendors: list } = vendors(
    supplier("Cannanore  Electric", { 2: "PK 1/465, 466 \r\n\r\n Kannur-670001 " }),
  );
  assert.equal(list[0].name, "Cannanore Electric");
  assert.equal(list[0].address, "PK 1/465, 466\nKannur-670001");
});

test("a PAN number stops the run — there is nowhere to keep one", () => {
  assert.throws(() => vendors(supplier("Power World", { 11: "ABCDE1234F" })), /PAN/);
});

test("a vendor sheet with different columns stops the run", () => {
  assert.throws(() => vendorsFromSheet(sheet(["Name", "Address"], [["Power World"]])), /columns/);
});

test("loose keys agree across punctuation and case, not across word order", () => {
  assert.equal(
    looseKey("QCLI Survey Instruments Pvt.Ltd"),
    looseKey("QCLI Survey Instruments Pvt. Ltd."),
  );
  assert.equal(looseKey("ELOR LIGHTING PVT LTD"), looseKey("Elor Lighting Pvt Ltd"));
  assert.notEqual(looseKey("Santhosh K"), looseKey("K Santhosh"));
});

const CATEGORIES = materialCategoriesFromSheet(
  sheet(null, [
    ["CAR", "Carpentry"],
    ["CVL", "Civil Materials"],
    ["PLD", "Plumbing Materials"],
  ]),
);
const MATERIAL_HEADER = [
  "New Code",
  "Category",
  "Material Family",
  "Material / Specification",
  "UOM",
  "Rate",
];
const materials = (...rows: (string | undefined)[][]) =>
  materialsFromSheet(sheet(MATERIAL_HEADER, rows), CATEGORIES);

test("materials: units mapped into the uoms master, a blank one is nos, rates to the paisa", () => {
  const { materials: list, notes } = materialsFromSheet(
    sheet(MATERIAL_HEADER, [
      [
        "CAR/02A",
        "Carpentry",
        "4 mm Frosted Glass",
        "4 mm Frosted Glass",
        "nos",
        "194.2670588235294",
      ],
      [
        "CAR/06A",
        "Carpentry",
        "8 mm Toughened Plain Glass",
        "8 mm Toughened Plain Glass",
        undefined,
        "100",
      ],
      ["CVL/07", "Civil Materials", "Cementopc", "CementOPC53Grade", "bags", "380"],
      ["PLD/09", "Plumbing Materials", "Solvent", "Solvent  Cement", "ltr", "500"],
    ]),
    CATEGORIES,
  );
  assert.deepEqual(
    list.map((m) => [m.code, m.name, m.uom, m.indicative_price, m.category]),
    [
      ["CAR/02A", "4 mm Frosted Glass", "nos", 194.27, "Carpentry"],
      ["CAR/06A", "8 mm Toughened Plain Glass", "nos", 100, "Carpentry"],
      ["CVL/07", "CementOPC53Grade", "bag", 380, "Civil Materials"],
      ["PLD/09", "Solvent Cement", "litre", 500, "Plumbing Materials"],
    ],
  );
  assert.ok(notes.some((n) => n.includes("CAR/06A")));
});

test("materials: a code filed under the wrong category, an unknown category or unit, or a reused code stops the run", () => {
  assert.throws(
    () => materials(["CVL/01", "Carpentry", "x", "AAC Blocks", "nos", "1"]),
    /filed under/,
  );
  assert.throws(
    () => materials(["CAR/01", "Woodwork", "x", "Glass", "nos", "1"]),
    /not on the Category sheet/,
  );
  assert.throws(
    () => materials(["CAR/01", "Carpentry", "x", "Glass", "crate", "1"]),
    /unknown unit/,
  );
  assert.throws(
    () =>
      materials(
        ["CAR/01", "Carpentry", "x", "Glass", "nos", "1"],
        ["CAR/01", "Carpentry", "x", "Mirror", "nos", "1"],
      ),
    /used twice/,
  );
});

test("materials: the same name and unit twice is kept and pointed out", () => {
  const { notes } = materials(
    ["PLD/80", "Plumbing Materials", "x", "Silicon Clear", "nos", "37"],
    ["PLD/81", "Plumbing Materials", "x", "Silicon Clear", "nos", "266"],
  );
  assert.ok(notes.some((n) => n.includes("PLD/80 and PLD/81")));
});

test("GST: 18%, 18 and Excel's 0.18 are one rate; a blank cell is no figure", () => {
  assert.equal(gstFromCell("18%", "r"), 18);
  assert.equal(gstFromCell("18", "r"), 18);
  assert.equal(gstFromCell("0.18", "r"), 18);
  assert.equal(gstFromCell("0", "r"), 0);
  assert.equal(gstFromCell(undefined, "r"), null);
  assert.throws(
    () => gstFromCell("eighteen", "Material row 4"),
    /Material row 4: "eighteen" is not a GST rate/,
  );
});
