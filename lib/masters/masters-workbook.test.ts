/**
 * The masters workbook decides which vendors, works and materials the
 * whole toolbox works from — a wrong merge joins two parties' bank
 * details, a wrong group files a work under the wrong stage. Every case
 * here is a real one from Masters.xlsx of 2026-10-06.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type SheetRow,
  VENDOR_COLUMNS,
  looseKey,
  materialCategoriesFromSheet,
  materialsFromSheet,
  stagesFromSheet,
  vendorsFromSheet,
  worksFromSheet,
} from "./masters-workbook";

const sheet = (header: string[] | null, body: (string | undefined)[][]): SheetRow[] => [
  ...(header ? [{ row: 1, cells: header }] : []),
  ...body.map((cells, i) => ({ row: i + (header ? 2 : 1), cells })),
];

// Vendor columns: 0 Sl, 1 Name, 2 Address, 3 Contact, 4 Mobile, 5 Designation,
// 6 Email, 7 MATERIAL, 8 SUBCONTRACTOR, 9 GSTIN, 10 GST State, 11 PAN,
// 12 Bank, 13 Account, 14 Holder, 15 IFSC.
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

// ---------------------------------------------------------------------------

const WORK_HEADER = ["Code", "Work Description", "Scope", "Unit", "Price"];

/** The sheet's own tricky rows, in its order, with enough around them to read. */
const WORKS = sheet(WORK_HEADER, [
  ["FD", "Foundation"],
  ["FD.1", "FD - Total Station Marking"],
  [undefined, "FD - Rubble Foundation"],
  ["FD.3", "FD - Dry Rubble Masonry"],
  ["FD.4", "FD - Excavation for Rubble Foundation"],
  ["FD.6", "FD - Dry Rubble Masonry", undefined, "M3", "1000"],
  ["FD.11", "FD - Isolated Foundation"],
  ["FD.14", "FD - PCC for Isolated Footing", "Including Shuttering and Levelling", "M3", "4000"],
  ["FD.18", "FD - Pile Foundation"],
  ["FD.24", "FD - Plinth Beam"],
  ["SS", "Superstructure", undefined, undefined, "230"],
  ["SS.2", "SS - Block Work up to GF Lintel Bottom", undefined, "0.12", "27.6"],
  ["SS.2a", "SS - 1-Side Plastered Wall Masonry"],
  ["SS.3", "SS - Ground Floor Lintel Beam RCC Work", undefined, "0.08", "18.399999999999999"],
  ["SS.7b", "SS - 1-Side Plastered Wall Masonry"],
  ["PF", "Pre-Finishes"],
  ["PF", "PF - Plastering"],
  ["PF.1", "PF - Plastering of Projections", undefined, "Rft", "125"],
  ["PF.2", "PF - Bull Marking", undefined, "Lumpsum"],
  ["PF.3", "PF - Joinery Frame Fixing", undefined, "Per Pali", "600"],
  ["PF.16", "PF - Screed", undefined, "Sqft", "16"],
  ["PF.2", "PF - Roof Fabrication"],
  ["PF.2h", "PF - Moiner Sheet Laying for Roof Fabrication", undefined, "Sqft", "8"],
  ["PF.2k", "PF - Stair Fabrication"],
  ["F", "Finishes"],
  ["F.1", "F - Internal Finishing Works"],
  ["F.1.1", "F - Polishing Works"],
  ["F.1.7", "F - Floor Tiling"],
  ["F.1.8", "F - Floor Tiling", "Tile Laying (2x2, 2x4, 2x6) - Floor", "Sqft", "22"],
  ["F.1.29", "PF - Joinery Frame Making - Door", undefined, "Pali", "600"],
  ["F.1.38", "F - Joinery Shutter Making - Double Door", undefined, "Nos", "5500"],
  ["F.1.40", "F - Joinery Shutter Making - Double Door", undefined, "Nos", "8000"],
  ["F.2", "F - External Finishes"],
  ["F.2.10", "F - Wooden Column"],
  ["LP", "Landscape & Parking"],
  ["LP.2", "LP - Pathway Stone Paving Works", undefined, "SFT", "75"],
  ["MEP", "MEP", undefined, undefined, "135"],
  ["MEP.11", "Snagging", undefined, "0.05", "6.75"],
  [undefined, "MEP - Electrical Connection Checking"],
]);

const works = worksFromSheet(WORKS);
const item = (code: string) => {
  const found = works.items.find((i) => i.code === code);
  assert.ok(found, `${code} should be a work`);
  return found;
};

test("category rows become the categories, prefixes come off the names", () => {
  assert.deepEqual(
    works.categories.map((c) => `${c.code} ${c.name}`),
    [
      "FD Foundation",
      "SS Superstructure",
      "PF Pre-Finishes",
      "F Finishes",
      "LP Landscape & Parking",
      "MEP MEP",
    ],
  );
  assert.equal(item("FD.1").name, "Total Station Marking");
  assert.equal(item("FD.1").group, null);
});

test("the headings are the groups, each with a code of its own", () => {
  assert.deepEqual(
    works.groups.map((g) => `${g.code} ${g.name}`),
    [
      "FD.3 Rubble Foundation",
      "FD.11 Isolated Foundation",
      "FD.18 Pile Foundation",
      "FD.24 Plinth Beam",
      "PF.0 Plastering",
      "PF.20 Roof Fabrication",
      "F.1 Internal Finishing Works",
      "F.2 External Finishes",
    ],
  );
  assert.equal(item("FD.4").group, "FD.3");
  assert.equal(item("FD.14").group, "FD.11");
  assert.equal(item("PF.1").group, "PF.0");
  assert.equal(item("F.1.8").group, "F.1");
  assert.equal(item("F.2.10").group, "F.2");
});

test("Roof Fabrication's PF.2 clash: Bull Marking keeps PF.2, the roof works become PF.20a…", () => {
  assert.equal(item("PF.2").name, "Bull Marking");
  assert.equal(item("PF.20h").name, "Monier Sheet Laying for Roof Fabrication");
  assert.equal(item("PF.20h").group, "PF.20");
  assert.ok(!works.items.some((i) => i.code === "PF.2h"));
});

test("a group stops where its kind of work stops", () => {
  assert.equal(item("PF.16").group, null); // Screed is not Plastering
  assert.equal(item("PF.20k").group, null); // Stair Fabrication is not Roof Fabrication
});

test("headings and repeats listed as works are left out, with a reason", () => {
  for (const code of ["FD.3", "F.1.1", "F.1.7"]) {
    assert.ok(!works.items.some((i) => i.code === code), `${code} should not be a work`);
    assert.ok(works.notes.some((n) => n.includes(`${code} "`)));
  }
});

test("the uncoded row under Snagging becomes MEP.11b", () => {
  assert.equal(item("MEP.11b").name, "Electrical Connection Checking");
});

test("scope joins the name, and the floor separates the sheet's repeated names", () => {
  assert.equal(item("F.1.8").name, "Floor Tiling — Tile Laying (2x2, 2x4, 2x6) - Floor");
  assert.equal(item("FD.14").name, "PCC for Isolated Footing — Including Shuttering and Levelling");
  assert.equal(item("SS.2a").name, "1-Side Plastered Wall Masonry - GF");
  assert.equal(item("SS.7b").name, "1-Side Plastered Wall Masonry - FF");
  assert.equal(item("F.1.29").name, "Joinery Frame Making - Door");
});

test("the rate book: units mapped, the SS and MEP shares read as a rate per sqft", () => {
  assert.deepEqual([item("FD.6").uom, item("FD.6").labour_rate], ["cum", 1000]);
  assert.deepEqual([item("PF.1").uom, item("PF.1").labour_rate], ["rft", 125]);
  assert.deepEqual([item("PF.2").uom, item("PF.2").labour_rate], ["lumpsum", null]);
  assert.deepEqual([item("PF.3").uom, item("F.1.29").uom], ["pali", "pali"]);
  assert.deepEqual([item("LP.2").uom, item("LP.2").labour_rate], ["sqft", 75]);
  assert.deepEqual([item("SS.2").uom, item("SS.2").labour_rate], ["sqft", 27.6]);
  assert.deepEqual([item("SS.3").uom, item("SS.3").labour_rate], ["sqft", 18.4]);
  assert.deepEqual([item("SS.2a").uom, item("SS.2a").labour_rate], [null, null]);
  assert.ok(works.notes.some((n) => n.startsWith("SS:")));
});

test("the same name twice under one heading is kept and pointed out", () => {
  assert.ok(works.notes.some((n) => n.includes("F.1.38 and F.1.40")));
});

test("a work with no code, an unknown unit or a reused code stops the run", () => {
  const withRow = (row: (string | undefined)[]) =>
    sheet(WORK_HEADER, [...WORKS.slice(1).map((r) => r.cells), row]);
  assert.throws(() => worksFromSheet(withRow([undefined, "MEP - Earthing"])), /no code/);
  assert.throws(
    () => worksFromSheet(withRow(["MEP.12", "MEP - Earthing", undefined, "Bucket", "5"])),
    /unknown unit/,
  );
  assert.throws(
    () => worksFromSheet(withRow(["MEP.11", "MEP - Earthing"])),
    /MEP.11 is used twice/,
  );
});

test("a fix whose row has gone from the sheet stops the run", () => {
  const without = sheet(
    WORK_HEADER,
    WORKS.slice(1)
      .map((r) => r.cells)
      .filter((cells) => cells[1] !== "PF - Roof Fabrication"),
  );
  assert.throws(() => worksFromSheet(without), /no longer has PF.2/);
});

// ---------------------------------------------------------------------------

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

test("stages, in the sheet's order, each once", () => {
  assert.deepEqual(
    stagesFromSheet(sheet(null, [["Engineering Consultation"], ["Foundation "], [undefined]])),
    ["Engineering Consultation", "Foundation"],
  );
  assert.throws(() => stagesFromSheet(sheet(null, [["MEP"], ["mep"]])), /twice/);
});
