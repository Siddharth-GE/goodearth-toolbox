import assert from "node:assert/strict";
import { test } from "node:test";

import type { SheetRow } from "./masters-workbook";
import {
  type DbWork,
  type SheetFixes,
  estateWorks,
  infrastructureWorks,
  maintenanceWorks,
  matchWorks,
  mobilisationWorks,
  villaBridge,
} from "./works-workbook";

const sheet = (header: string[], body: (string | undefined)[][]): SheetRow[] => [
  { row: 1, cells: header },
  ...body.map((cells, i) => ({ row: i + 2, cells })),
];

const INFRA = [
  "Stage",
  "Code",
  "Work Description",
  "Labour Description",
  "Unit",
  "Unit Rate",
  "Remarks",
];
const NO_FIXES: SheetFixes = { finishesShift: [], leftOut: [] };

// Columns: stage, code, heading, work, unit, rate, remark.
const INFRA_ROWS = sheet(INFRA, [
  ["Site Mobilisation", undefined, "Engineering and Survey"],
  [undefined, "ES.01", "Engineering Consultation"],
  [undefined, "ES.01.01", undefined, "Engineering Consultation"],
  ["Infrastructure - Civil", undefined, "Roads"],
  [undefined, "RD.01", "Bituminous Road"],
  [undefined, "RD.01.01", undefined, "Subgrade Preparation"],
  [undefined, "RD.02", "Cement Concrete Road"],
  [undefined, "RD.02.01", undefined, "Subgrade Preparation"],
  ["Buildings - Foundation"],
  [undefined, "FD.01", "Marking"],
  [undefined, "FD.01.01", undefined, "FD - Total Station Marking"],
  [undefined, "FD.01.02", undefined, "FD - Dry Rubble Masonry", "M3", "1000"],
  ["Buildings - Superstructure"],
  [undefined, "SS.01", "SS - Block Work up to GF Lintel Bottom", undefined, "12%", "27.6"],
  [undefined, "SS.01.01", undefined, "SS - Curing"],
  [undefined, "SS.01.02", undefined, "SS - One-Side Plastered Wall Masonry"],
  [undefined, "SS.10", "SS - Attic Floor Block Work up to Bed Block"],
  [undefined, "SS.10.01", undefined, "SS - Attic Floor Block Work up to Bed Block", "8%", "18.4"],
  ["Buildings - Finishes", "F.01", "F - Internal Finishing Works (Tiling)"],
  [undefined, "F.01.01", undefined, "F - Floor Tiling", "Sqft", "22"],
  [undefined, "F.01.02", undefined, "F - Floor Tiling", "Sqft", "35", "Tile Laying - Floor"],
  [
    "Buildings - Landscape",
    "LP.01",
    "LP - Earthwork",
    undefined,
    undefined,
    undefined,
    "Tile Laying - Wall",
  ],
  [undefined, "LP.01.01", undefined, "Site Cleaning"],
]);

const SHIFT: SheetFixes = {
  finishesShift: [{ code: "F.01.01", remarkBelow: "Tile Laying - Floor" }],
  leftOut: [],
};

test("families, categories by their children's code, groups and works by the shape of the row", () => {
  const out = infrastructureWorks(INFRA_ROWS, SHIFT);
  assert.deepEqual(
    out.categories.map((c) => [c.family, c.code, c.name]),
    [
      ["Site Mobilisation", "ES", "Engineering and Survey"],
      ["Infrastructure - Civil", "RD", "Roads"],
      ["Buildings", "FD", "Foundation"],
      ["Buildings", "SS", "Superstructure"],
      ["Buildings", "F", "Finishes"],
      ["Buildings", "LP", "Landscape"],
    ],
  );
  assert.deepEqual(out.groups.map((g) => [g.code, g.category, g.name]).slice(0, 4), [
    ["ES.01", "ES", "Engineering Consultation"],
    ["RD.01", "RD", "Bituminous Road"],
    ["RD.02", "RD", "Cement Concrete Road"],
    ["FD.01", "FD", "Marking"],
  ]);
  const fd = out.works.find((w) => w.code === "FD.01.02")!;
  assert.deepEqual(
    [fd.name, fd.group, fd.uom, fd.labour_rate],
    ["Dry Rubble Masonry", "FD.01", "cum", 1000],
  );
});

test("a stage's share per sqft on a heading becomes its package work; on a work, that work is priced", () => {
  const out = infrastructureWorks(INFRA_ROWS, SHIFT);
  const pkg = out.works.find((w) => w.code === "SS.01.00")!;
  assert.deepEqual(
    [pkg.name, pkg.group, pkg.uom, pkg.labour_rate, pkg.is_package],
    ["Block Work up to GF Lintel Bottom — package per sqft", "SS.01", "sqft", 27.6, true],
  );
  const attic = out.works.find((w) => w.code === "SS.10.01")!;
  assert.deepEqual([attic.uom, attic.labour_rate, attic.is_package], ["sqft", 18.4, true]);
  assert.equal(out.works.find((w) => w.code === "SS.01.01")!.uom, null);
});

test("Finishes takes each remark from the row below; anything else keeps its own row's", () => {
  const out = infrastructureWorks(INFRA_ROWS, SHIFT);
  assert.equal(
    out.works.find((w) => w.code === "F.01.01")!.name,
    "Floor Tiling — Tile Laying - Floor",
  );
  assert.equal(
    out.works.find((w) => w.code === "F.01.02")!.name,
    "Floor Tiling — Tile Laying - Wall",
  );
  assert.equal(out.works.find((w) => w.code === "LP.01.01")!.name, "Site Cleaning");
});

test("a corrected Finishes section, or a fix whose row has gone, stops the run", () => {
  assert.throws(
    () =>
      infrastructureWorks(INFRA_ROWS, {
        ...SHIFT,
        finishesShift: [{ code: "F.01.01", remarkBelow: "Other" }],
      }),
    /no longer on the row below/,
  );
  assert.throws(
    () =>
      infrastructureWorks(INFRA_ROWS, {
        ...SHIFT,
        finishesShift: [{ code: "F.09.09", remarkBelow: "x" }],
      }),
    /no longer has F\.09\.09/,
  );
  assert.throws(
    () =>
      infrastructureWorks(INFRA_ROWS, {
        ...SHIFT,
        leftOut: [{ code: "FD.9", name: "x", why: "y" }],
      }),
    /no longer has FD\.9/,
  );
});

test("a left-out row is kept for the bridge and flagged", () => {
  const out = infrastructureWorks(INFRA_ROWS, {
    ...SHIFT,
    leftOut: [{ code: "FD.01.02", name: "FD - Dry Rubble Masonry", why: "a repeat" }],
  });
  assert.equal(out.works.find((w) => w.code === "FD.01.02")!.left_out, "a repeat");
});

test("a code under the wrong category, a work with no code, an unknown unit or a wrong layout stops the run", () => {
  const bad = (row: (string | undefined)[]) =>
    infrastructureWorks(
      sheet(INFRA, [["Buildings - Foundation"], [undefined, "FD.01", "Marking"], row]),
      NO_FIXES,
    );
  assert.throws(() => bad([undefined, "SS.01.01", undefined, "Curing"]), /sits under FD/);
  assert.throws(() => bad([undefined, undefined, undefined, "Curing"]), /has no code/);
  assert.throws(
    () => bad([undefined, "FD.01.01", undefined, "Curing", "bags", "3"]),
    /unknown unit "bags"/,
  );
  assert.throws(
    () => bad([undefined, "FD.02", "Rubble", undefined, "Sqft", "3"]),
    /share per sqft/,
  );
  assert.throws(() => infrastructureWorks(sheet(["Code"], []), NO_FIXES), /no longer starts with/);
});

const MOB = sheet(
  ["Stage", "Code", "Work description"],
  [
    ["Site Mobilisation"],
    [undefined, "SM.1", "SM - Site Formation"],
    [undefined, "SM.9", "Site Stores and Material Storage Areas"],
  ],
);
const MAIN = sheet(
  ["Stage", "Code", "Work description"],
  [
    ["Common Area Maintenance"],
    [undefined, "MAIN.1", "Roads"],
    ["Security"],
    [undefined, "MAIN.10", "Security Guards"],
  ],
);

test("mobilisation is one category; maintenance's sections are its groups", () => {
  assert.deepEqual(
    mobilisationWorks(MOB).works.map((w) => [w.code, w.name, w.group]),
    [
      ["SM.1", "Site Formation", null],
      ["SM.9", "Site Stores and Material Storage Areas", null],
    ],
  );
  const main = maintenanceWorks(MAIN);
  assert.deepEqual(
    main.groups.map((g) => [g.code, g.name]),
    [
      ["MAIN.S1", "Common Area Maintenance"],
      ["MAIN.S2", "Security"],
    ],
  );
  assert.deepEqual(
    main.works.map((w) => [w.code, w.group]),
    [
      ["MAIN.1", "MAIN.S1"],
      ["MAIN.10", "MAIN.S2"],
    ],
  );
});

test("the estate: families in order, a name repeated in a category takes its group's name", () => {
  const all = estateWorks(
    { infrastructure: INFRA_ROWS, mobilisation: MOB, maintenance: MAIN },
    SHIFT,
  );
  assert.deepEqual(
    all.categories.map((c) => c.code),
    ["SM", "ES", "RD", "FD", "SS", "F", "LP", "MAIN"],
  );
  assert.deepEqual(
    all.works.filter((w) => w.category === "RD").map((w) => w.name),
    ["Subgrade Preparation (Bituminous Road)", "Subgrade Preparation (Cement Concrete Road)"],
  );
  assert.equal(all.categories.find((c) => c.code === "MAIN")!.family, "Maintenance");
});

const VILLAS = sheet(
  ["Stage", "Code", "Work description", "Labour description", "Unit", "Unit rate"],
  [
    ["Engineering Consultation"],
    [undefined, "ENC.1", undefined, "Structural Design"],
    ["Foundation"],
    [undefined, "MARK", "Marking"],
    [undefined, "FD.1", undefined, "FD - Total Station Marking"],
    [undefined, "FD.6", undefined, "FD - Dry Rubble Masonry", "M3", "1000"],
    ["Super Structure"],
    [undefined, "SS - A", "SS - Block Work up to GF Lintel Bottom", undefined, "0.12", "27.6"],
    [undefined, "SS.1", undefined, "SS - Curing"],
    [undefined, "SS.2a", undefined, "SS - 1-Side Plastered Wall Masonry"],
    [undefined, "SS-K", "SS - Attic Floor Block Work up to Bed Block"],
    [undefined, "SS.12A", undefined, "SS - Attic Floor Block Work up to Bed Block", "0.08", "18.4"],
  ],
);
const SMALL = estateWorks(
  {
    infrastructure: sheet(
      INFRA,
      INFRA_ROWS.slice(9, 19).map((r) => r.cells),
    ),
    mobilisation: MOB,
    maintenance: MAIN,
  },
  NO_FIXES,
);

test("the villas sheet pairs with the new rows by place, headings with their packages", () => {
  const bridge = villaBridge(VILLAS, SMALL);
  const pair = (old: string) => bridge.find((b) => b.oldCode === old)?.newCode;
  assert.equal(pair("FD.1"), "FD.01.01");
  assert.equal(pair("FD.6"), "FD.01.02");
  assert.equal(pair("SS - A"), "SS.01.00");
  assert.equal(pair("SS-K"), null);
  assert.equal(pair("SS.2a"), "SS.01.02");
  assert.equal(pair("ENC.1"), undefined);
});

test("a villas sheet that no longer lines up stops the run", () => {
  const short = sheet(
    ["Stage", "Code", "Work description", "Labour description", "Unit"],
    [
      ["Foundation"],
      [undefined, "MARK", "Marking"],
      [undefined, "FD.1", undefined, "FD - Total Station Marking"],
    ],
  );
  assert.throws(
    () => villaBridge(short, SMALL),
    /FD: the villas sheet has 1 works, the new sheet 2/,
  );
});

const db = (code: string, category: string, name: string, extra: Partial<DbWork> = {}): DbWork => ({
  id: `id-${code}`,
  code,
  category,
  name,
  uses: 0,
  priced: false,
  ...extra,
});

test("today's works find their new rows: by code, by the villas sheet, priced ones by their package", () => {
  const bridge = villaBridge(VILLAS, SMALL);
  const { matches } = matchWorks(
    [
      db("SM.1", "SM", "Site Formation"),
      db("FD.6", "FD", "Dry Rubble Masonry"),
      db("SS.2a", "SS", "1-Side Plastered Wall Masonry - GF"),
      db("SS.2", "SS", "Block Work up to GF Lintel Bottom", { priced: true }),
      db("SS.9", "SS", "Attic Floor Block Work up to Bed Block", { priced: true }),
      db("SS.6a", "SS", "Roof Beam Shuttering - GF"),
    ],
    SMALL,
    bridge,
    [],
  );
  const to = (code: string) => matches.find((m) => m.work.code === code)!;
  assert.deepEqual([to("SM.1").newCode, to("SM.1").how], ["SM.1", "same code"]);
  assert.deepEqual([to("FD.6").newCode, to("FD.6").how], ["FD.01.02", "villas sheet FD.6"]);
  assert.equal(to("SS.2a").newCode, "SS.01.02");
  assert.deepEqual([to("SS.2").newCode, to("SS.2").how], ["SS.01.00", "the stage's package"]);
  assert.equal(to("SS.9").newCode, "SS.10.01");
  assert.deepEqual([to("SS.6a").newCode, to("SS.6a").how], [null, "no match"]);
});

test("two of today's works for one new row: the one in use keeps it; a hand remap wins and is checked", () => {
  const bridge = villaBridge(VILLAS, SMALL);
  const { matches, notes } = matchWorks(
    [
      db("SS.A", "SS", "Block Work up to GF Lintel Bottom", { priced: true }),
      db("SS.2", "SS", "Block Work up to GF Lintel Bottom", { uses: 1 }),
      db("SS.7", "SS", "First Floor Lintel Beam Works"),
    ],
    SMALL,
    bridge,
    [{ code: "SS.7", name: "First Floor Lintel Beam Works", becomes: "SS.01.01" }],
  );
  const to = (code: string) => matches.find((m) => m.work.code === code)!;
  assert.equal(to("SS.2").newCode, "SS.01.00");
  assert.deepEqual([to("SS.A").newCode, to("SS.A").how], [null, "repeats SS.2"]);
  assert.ok(notes.some((n) => n.includes("SS.2 keeps it")));
  assert.deepEqual([to("SS.7").newCode, to("SS.7").how], ["SS.01.01", "by hand"]);
  assert.throws(
    () => matchWorks([], SMALL, bridge, [{ code: "X.1", name: "Gone", becomes: null }]),
    /no longer in Masters/,
  );
  assert.throws(
    () =>
      matchWorks([db("X.1", "SS", "Gone")], SMALL, bridge, [
        { code: "X.1", name: "Gone", becomes: "SS.99" },
      ]),
    /which the sheet no longer has/,
  );
});
