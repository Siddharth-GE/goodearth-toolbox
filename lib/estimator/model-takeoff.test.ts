import assert from "node:assert/strict";
import { test } from "node:test";
import {
  measureFromUnit,
  parseTakeoff,
  planImport,
  type EstimateForModel,
  type Takeoff,
  type WorkForModel,
} from "./model-takeoff";

const GUID = "c742555c-0000-4000-8000-000000000001";
const VILLA = "11111111-2222-4333-8444-555555555555";

/** A small takeoff in the extension's own shape (export.rb). */
function file(overrides: Record<string, unknown> = {}) {
  return {
    format: "goodearth-qs-takeoff",
    version: 1,
    exported_at: "2026-10-14T07:14:01Z",
    generator: "Goodearth QS for SketchUp 0.3.0",
    model: { file: "Sample villa.skp", title: "Sample villa", guid: GUID, villa: null },
    works_list: { file: "works.csv", works: 266 },
    lines: [
      {
        work_code: "FD.14",
        work_name: "PCC for Isolated Footing",
        uom: "cum",
        measured_as: "volume",
        qty: 0.392,
        rows: [
          {
            description: "SAMPLE VILLA > Foundation > P1",
            nos: 2,
            length: 1.4,
            breadth: 1.4,
            depth: 0.1,
            qty: 0.392,
            model_refs: ["19.21.42", "19.21.106"],
          },
        ],
      },
      {
        work_code: "FD.9",
        work_name: "Laterite Basement Masonry",
        uom: "cum",
        measured_as: "volume",
        qty: 1.81845,
        rows: [
          { description: "BW1", nos: 1, length: 4, breadth: 0.9, depth: 0.3, model_refs: ["1"] },
          {
            description: "BW2",
            nos: 1,
            length: 2.735,
            breadth: 0.9,
            depth: 0.3,
            model_refs: ["2"],
          },
        ],
      },
      {
        work_code: "PF.8",
        work_name: "Wall Plastering - GF",
        uom: "sqft",
        measured_as: "area",
        qty: 3.875,
        // An older extension leaves unused boxes out instead of sending null.
        rows: [{ description: "W1 (painted faces)", nos: 1, length: 3.875, model_refs: ["3"] }],
      },
    ],
    not_measured: [
      { work_code: "SS.3", work_name: "Masonry GF", reason: "manual", elements: 2, model_refs: [] },
      { work_code: "FD.9", work_name: "Laterite", reason: "not_solid", elements: 1 },
    ],
    issues: [{ level: "error", title: "Not a solid", detail: "BW3 leaks", model_refs: ["9"] }],
    summary: { tagged: 14, lines: 3, rows: 4, errors: 1, warnings: 0 },
    ...overrides,
  };
}

const read = (doc: unknown): Takeoff => {
  const parsed = parseTakeoff(JSON.stringify(doc));
  if (!("takeoff" in parsed) || !parsed.takeoff) throw new Error(`not read: ${parsed.problem}`);
  return parsed.takeoff;
};

const work = (
  code: string,
  uom: string | null,
  extra: Partial<WorkForModel> = {},
): WorkForModel => ({
  workItemId: `w-${code}`,
  code,
  name: `Work ${code}`,
  isActive: true,
  uom,
  modelMeasure: null,
  ...extra,
});
const WORKS = [
  work("FD.14", "cum"),
  work("FD.9", "cum"),
  work("PF.8", "sqft"),
  work("SS.3", "sqft", { modelMeasure: "manual" }),
];

test("a takeoff is read: model, works, rows, issues; a missing box is 'not used'", () => {
  const takeoff = read(file());
  assert.equal(takeoff.model.file, "Sample villa.skp");
  assert.equal(takeoff.model.guid, GUID);
  assert.equal(takeoff.lines.length, 3);
  assert.equal(takeoff.rowCount, 4);
  assert.equal(takeoff.errorCount, 1);
  const plaster = takeoff.lines[2];
  assert.equal(plaster.problem, null);
  assert.deepEqual(plaster.rows[0], {
    description: "W1 (painted faces)",
    nos: 1,
    length: 3.875,
    breadth: null,
    depth: null,
    modelRefs: ["3"],
  });
  assert.equal(takeoff.notMeasured.length, 2);
});

test("anything that isn't a version-1 takeoff is refused whole", () => {
  assert.match(String(parseTakeoff("").problem), /Nothing was received/);
  assert.match(String(parseTakeoff("{not json").problem), /can't be read/);
  assert.match(
    String(parseTakeoff(JSON.stringify({ format: "other" })).problem),
    /isn't a Goodearth QS takeoff/,
  );
  assert.match(String(parseTakeoff(JSON.stringify(file({ version: 2 }))).problem), /version 2/);
  assert.match(String(parseTakeoff(JSON.stringify(file({ lines: {} }))).problem), /list of works/);
  assert.match(String(parseTakeoff("x".repeat(3_000_001)).problem), /larger than any takeoff/);
});

test("the villa the model remembers is only a suggestion, and only a real id", () => {
  const remembered = read(
    file({ model: { file: "a.skp", guid: GUID, villa: { unit_id: VILLA, name: "Villa 12" } } }),
  );
  assert.deepEqual(remembered.model.villa, { unitId: VILLA, name: "Villa 12" });
  const junk = read(
    file({ model: { file: "a.skp", villa: { unit_id: "'; drop table", name: "x" } } }),
  );
  assert.equal(junk.model.villa, null);
});

test("a first import adds every work, and the hand-measured one goes on to measure", () => {
  const plan = planImport(read(file()), WORKS, null, [], []);
  assert.deepEqual(
    plan.entries.map((entry) => [entry.code, entry.kind]),
    [
      ["FD.14", "add"],
      ["FD.9", "add"],
      ["PF.8", "add"],
      ["SS.3", "to_measure"],
    ],
  );
  const footing = plan.entries[0];
  assert.equal(footing.rows, 1);
  assert.equal(footing.qty, 0.392);
  assert.equal(footing.modelQtyDiffers, null);
  assert.deepEqual(plan.payload[0], {
    work_item_id: "w-FD.14",
    rows: [
      {
        description: "SAMPLE VILLA > Foundation > P1",
        nos: 2,
        length: 1.4,
        breadth: 1.4,
        depth: 0.1,
        model_refs: ["19.21.42", "19.21.106"],
      },
    ],
  });
  // The hand-measured work rides along with no rows; "not_solid" is a
  // problem in the model, not a work to put on.
  assert.deepEqual(plan.payload[3], { work_item_id: "w-SS.3", rows: [] });
  assert.equal(plan.payload.length, 4);
  assert.deepEqual(plan.counts, {
    add: 3,
    replace: 0,
    refused: 0,
    toMeasure: 1,
    removed: 0,
    materials: 0,
    refusedMaterials: 0,
    otherCosts: 0,
  });
  assert.equal(plan.canImport, true);
  assert.equal(plan.differentModel, null);
});

test("an unknown code, a switched-off work and a work with no rate-book unit are refused by name", () => {
  const plan = planImport(
    read(file()),
    [work("FD.9", null), work("PF.8", "sqft", { isActive: false })],
    null,
    [],
    [],
  );
  const why = Object.fromEntries(plan.entries.map((entry) => [entry.code, entry.why]));
  assert.match(String(why["FD.14"]), /FD\.14 is not in the toolbox's works/);
  assert.match(String(why["FD.9"]), /no unit in the rate book — set its unit/);
  assert.match(String(why["PF.8"]), /switched off in Masters/);
  assert.equal(plan.payload.length, 0);
});

test("a unit that disagrees with the rate book refuses that work and the rest imports", () => {
  const plan = planImport(
    read(file()),
    [...WORKS.filter((w) => w.code !== "FD.9"), work("FD.9", "sqm")],
    null,
    [],
    [],
  );
  const masonry = plan.entries.find((entry) => entry.code === "FD.9");
  assert.equal(masonry?.kind, "refused");
  assert.match(String(masonry?.why), /rate book measures FD\.9 in sqm; the model sent cum/);
  assert.equal(plan.counts.add, 2);
  assert.ok(!plan.payload.some((line) => line.work_item_id === "w-FD.9"));
});

test("a row a person could not have typed refuses its work: a box at zero, an empty row, a long description", () => {
  const withRows = (rows: unknown[]) =>
    file({ lines: [{ work_code: "FD.9", uom: "cum", measured_as: "volume", rows }] });
  const why = (rows: unknown[]) =>
    planImport(read(withRows(rows)), WORKS, null, [], []).entries[0].why;

  assert.match(
    String(why([{ nos: 1, length: 0, model_refs: [] }])),
    /FD\.9: row 1 — length must be a number more than zero/,
  );
  assert.match(
    String(why([{ nos: 1 }, { nos: -2 }])),
    /row 2 — nos must be a number more than zero/,
  );
  assert.match(String(why([{ nos: "3" }])), /nos must be a number/);
  assert.match(
    String(why([{ description: "nothing measured", nos: null, length: null }])),
    /Enter at least one/i,
  );
  assert.match(
    String(why([{ description: "x".repeat(2_001), nos: 1 }])),
    /description is too long/,
  );
  assert.match(
    String(why([{ nos: 1, model_refs: "not a list" }])),
    /model references can't be read/,
  );
  assert.match(String(why([])), /the model sent no rows/);
});

test("a code listed twice is refused both times — which one is meant is unknowable", () => {
  const twice = file({
    lines: [
      { work_code: "FD.9", uom: "cum", rows: [{ nos: 1 }] },
      { work_code: "FD.9", uom: "cum", rows: [{ nos: 2 }] },
    ],
  });
  const plan = planImport(read(twice), WORKS, null, [], []);
  assert.deepEqual(
    plan.entries.filter((entry) => entry.code === "FD.9").map((entry) => entry.kind),
    ["refused", "refused"],
  );
  assert.match(String(plan.entries[0].why), /more than once/);
});

const estimate = (
  lines: EstimateForModel["lines"],
  guid: string | null = GUID,
): EstimateForModel => ({
  estimateId: "e-1",
  modelFile: "Sample villa.skp",
  modelGuid: guid,
  lines,
});

test("sending again replaces the model's rows, keeps hand rows, and says so", () => {
  const plan = planImport(
    read(file()),
    WORKS,
    estimate([
      { lineId: "l-9", workItemId: "w-FD.9", qty: 2.818, handRows: 1, modelRows: 2 },
      { lineId: "l-14", workItemId: "w-FD.14", qty: 0.392, handRows: 0, modelRows: 1 },
    ]),
    [],
    [],
  );
  const masonry = plan.entries.find((entry) => entry.code === "FD.9");
  assert.equal(masonry?.kind, "replace");
  assert.equal(masonry?.replacesRows, 2);
  assert.equal(masonry?.rows, 2);
  assert.equal(masonry?.handRows, 1);
  assert.equal(plan.counts.replace, 2);
  assert.equal(plan.removals.length, 0);
});

test("a work the model stops measuring loses its model rows: to measure again, or its hand rows stay", () => {
  const plan = planImport(
    read(file({ lines: [] })),
    [...WORKS, work("FD.10", "cum"), work("FD.6", "cum")],
    estimate([
      { lineId: "l-10", workItemId: "w-FD.10", qty: 0.18, handRows: 0, modelRows: 1 },
      { lineId: "l-6", workItemId: "w-FD.6", qty: 3, handRows: 2, modelRows: 1 },
      { lineId: "l-x", workItemId: "w-FD.9", qty: 5, handRows: 3, modelRows: 0 },
    ]),
    [],
    [],
  );
  assert.deepEqual(
    plan.removals.map((removal) => [removal.code, removal.modelRows, removal.backToMeasure]),
    [
      ["FD.6", 1, false],
      ["FD.10", 1, true],
    ],
  );
  assert.equal(plan.canImport, true);
});

test("a typed quantity the model's rows replace is named; a work already measured by hand is not", () => {
  const plan = planImport(
    read(file()),
    WORKS,
    estimate([
      { lineId: "l-14", workItemId: "w-FD.14", qty: 12, handRows: 0, modelRows: 0 },
      { lineId: "l-8", workItemId: "w-PF.8", qty: 40, handRows: 2, modelRows: 0 },
    ]),
    [],
    [],
  );
  const footing = plan.entries.find((entry) => entry.code === "FD.14");
  assert.equal(footing?.kind, "add");
  assert.equal(footing?.typedQty, 12);
  const plaster = plan.entries.find((entry) => entry.code === "PF.8");
  assert.equal(plaster?.typedQty, null);
  assert.equal(plaster?.handRows, 2);
});

test("a hand-measured work already on the estimate is left as it is", () => {
  const plan = planImport(
    read(file()),
    WORKS,
    estimate([{ lineId: "l-ss", workItemId: "w-SS.3", qty: 1200, handRows: 0, modelRows: 0 }]),
    [],
    [],
  );
  assert.equal(plan.entries.find((entry) => entry.code === "SS.3")?.kind, "already_on");
  assert.equal(plan.counts.toMeasure, 0);
});

test("a different model on the same villa is warned; the same one is not", () => {
  assert.deepEqual(
    planImport(read(file()), WORKS, estimate([], "another-guid"), [], []).differentModel,
    {
      file: "Sample villa.skp",
    },
  );
  assert.equal(planImport(read(file()), WORKS, estimate([], GUID), [], []).differentModel, null);
  assert.equal(planImport(read(file()), WORKS, estimate([], null), [], []).differentModel, null);
});

test("the toolbox sums the rows itself and shows a model total that disagrees", () => {
  const off = file({
    lines: [
      {
        work_code: "FD.9",
        uom: "cum",
        measured_as: "volume",
        qty: 9,
        rows: [{ nos: 4, length: 3, breadth: 0.15 }],
      },
    ],
  });
  const entry = planImport(read(off), WORKS, null, [], []).entries[0];
  assert.equal(entry.qty, 1.8); // 4 × 3 × 0.15, without the floating-point dust
  assert.equal(entry.modelQtyDiffers, 9);
});

test("a work the model measured differently from the rate book imports with a warning", () => {
  const stale = file({
    lines: [
      { work_code: "SS.3", uom: "sqft", measured_as: "area", rows: [{ nos: 1, length: 900 }] },
    ],
    not_measured: [],
  });
  const entry = planImport(read(stale), WORKS, null, [], []).entries[0];
  assert.equal(entry.kind, "add");
  assert.deepEqual(entry.measuredDifferently, { model: "area", rateBook: "manual" });
});

test("nothing to do means nothing to import", () => {
  const plan = planImport(read(file({ lines: [], not_measured: [] })), WORKS, null, [], []);
  assert.equal(plan.canImport, false);
});

test("a blank 'how it is measured' follows the unit, as SketchUp reads it", () => {
  assert.equal(measureFromUnit("cum"), "volume");
  assert.equal(measureFromUnit("SQFT"), "area");
  assert.equal(measureFromUnit("rft"), "length");
  assert.equal(measureFromUnit("nos"), "count");
  assert.equal(measureFromUnit("lumpsum"), "manual");
  assert.equal(measureFromUnit(null), "manual");
});

const UNITS = ["kg", "cum", "nos", "cft"];

/** 0.10's extra parts (0174): the model's mixes and steel, and what it worked out. */
const everything = () =>
  file({
    mixes: [
      {
        work_code: "FD.14",
        mix: "M20 Concrete",
        uom: "cum",
        measured_as: "volume",
        qty: 0.392,
        rows: [],
      },
      { work_code: "FD.14", mix: "m20 concrete", uom: "cum", qty: 0.1, rows: [] },
      { work_code: "FD.9", mix: "Laterite basement masonry", uom: "nos", qty: 1.8, rows: [] },
    ],
    steel: [
      {
        work_code: "FD.14",
        element: "Footing",
        uom: "kg",
        kg: 30,
        by_dia: { "10": 20, "0": 10, x: 5 },
      },
    ],
    derived: {
      lines: [
        { code: "FD.14", qty: 0.2, uom: "cum", basis: "Pits", from: "model" },
        { code: "CAR.02.03", qty: 70, uom: "sqft", basis: "Staircase treads", from: "settings" },
        { code: "PF.8", qty: 0, uom: "sqft", basis: "Nothing", from: "model" },
      ],
      mixes: [{ work_code: "CAR.02.03", name: "M20 Concrete", qty: 1.2 }],
      steel: [{ work_code: "CAR.02.03", dia: 8, kg: 30 }],
      extras: [{ work_code: "CAR.02.03", name: "Stair teak", qty: 18 }],
      allowances: [
        {
          code: "MEP",
          name: "MEP materials",
          unit: "sqft BUA",
          qty: 2335.63,
          rate: 200,
          amount: 467126,
          note: "Allowance",
        },
        { code: "", name: "Door hardware", unit: "nos", qty: 5, rate: -1, note: "" },
        { code: "", name: "", qty: 1 },
      ],
      settings: { toilets: 3, ceiling_tiles: "yes", nested: { no: 1 } },
      bua_sqft: 2335.63,
    },
  });

test("worked-out lines join the drawn line of their code, or arrive as their own; zero is not sent", () => {
  const takeoff = read(everything());
  const pcc = takeoff.lines.find((line) => line.workCode === "FD.14");
  assert.equal(pcc?.rows.length, 2);
  assert.deepEqual(pcc?.rows[1], {
    description: "Worked out: Pits",
    nos: 1,
    length: 0.2,
    breadth: null,
    depth: null,
    modelRefs: [],
  });
  const stair = takeoff.lines.find((line) => line.workCode === "CAR.02.03");
  assert.equal(stair?.rows[0].description, "From the settings: Staircase treads");
  assert.equal(stair?.uom, "sqft");
  assert.equal(takeoff.lines.filter((line) => line.workCode === "PF.8")[0].rows.length, 1);
});

test("the model's materials, steel as mixes, other costs and settings are read", () => {
  const takeoff = read(everything());
  assert.deepEqual(
    takeoff.materials.map((m) => [m.workCode, m.mix, m.uom, m.qty, m.from]),
    [
      ["FD.14", "M20 Concrete", "cum", 0.392, "model"],
      ["FD.14", "m20 concrete", "cum", 0.1, "model"],
      ["FD.9", "Laterite basement masonry", "nos", 1.8, "model"],
      ["FD.14", "Steel (kg per cum)", "kg", 10, "steel"],
      ["FD.14", "Steel 10 mm", "kg", 20, "steel"],
      ["CAR.02.03", "M20 Concrete", null, 1.2, "settings"],
      ["CAR.02.03", "Steel 8 mm", "kg", 30, "settings"],
      ["CAR.02.03", "Stair teak", null, 18, "extra"],
    ],
  );
  assert.deepEqual(takeoff.otherCosts, [
    {
      code: "MEP",
      name: "MEP materials",
      unit: "sqft BUA",
      qty: 2335.63,
      rate: 200,
      note: "Allowance",
    },
    { code: null, name: "Door hardware", unit: "nos", qty: 5, rate: null, note: null },
  ]);
  assert.deepEqual(takeoff.settings, { toilets: 3, ceiling_tiles: "yes" });
  assert.equal(takeoff.buaSqft, 2335.63);
  assert.equal(read(file()).materials.length, 0);
  assert.equal(read(file()).settings, null);
});

test("a takeoff with more materials than any villa has is refused whole", () => {
  const many = Array.from({ length: 2_001 }, () => ({
    work_code: "FD.14",
    mix: "M20",
    uom: "cum",
    qty: 1,
  }));
  assert.match(
    String(parseTakeoff(JSON.stringify(file({ mixes: many }))).problem),
    /more materials/,
  );
});

test("materials match the Mixes tab by name, add up, make what's missing, and refuse a unit that differs", () => {
  const works = [...WORKS, work("CAR.02.03", "sqft")];
  const mixes = [
    { name: "M20 Concrete", uom: "cum" },
    { name: "Laterite basement masonry", uom: "cum" },
  ];
  const plan = planImport(read(everything()), works, null, mixes, UNITS);
  const row = (code: string, mix: string) =>
    plan.materials.find((entry) => entry.code === code && entry.mix === mix);

  assert.equal(row("FD.14", "M20 Concrete")?.kind, "ok");
  assert.ok(Math.abs((row("FD.14", "M20 Concrete")?.qty ?? 0) - 0.492) < 1e-9);
  assert.equal(row("FD.9", "Laterite basement masonry")?.kind, "refused");
  assert.match(
    String(row("FD.9", "Laterite basement masonry")?.why),
    /is in cum; the model sent nos/,
  );
  assert.equal(row("CAR.02.03", "M20 Concrete")?.uom, "cum");
  assert.equal(row("CAR.02.03", "Steel 8 mm")?.kind, "new_mix");
  assert.equal(row("CAR.02.03", "Stair teak")?.kind, "refused");
  assert.match(String(row("CAR.02.03", "Stair teak")?.why), /didn't say its unit/);
  assert.deepEqual(plan.newMixes, [
    { name: "Steel (kg per cum)", uom: "kg" },
    { name: "Steel 10 mm", uom: "kg" },
    { name: "Steel 8 mm", uom: "kg" },
  ]);
  assert.deepEqual(
    plan.materialsPayload.find(
      (entry) => entry.mix_name === "M20 Concrete" && entry.work_item_id === "w-FD.14",
    ),
    {
      work_item_id: "w-FD.14",
      mix_name: "M20 Concrete",
      mix_uom: "cum",
      qty: 0.492,
      adds_to_recipe: false,
    },
  );
  assert.equal(plan.counts.otherCosts, 2);
  assert.equal(plan.otherCostsPayload.length, 2);
});

test("a material whose work is not on the estimate after the import is refused alone", () => {
  const plan = planImport(
    read(everything()),
    WORKS,
    null,
    [{ name: "M20 Concrete", uom: "cum" }],
    UNITS,
  );
  const stair = plan.materials.filter((entry) => entry.code === "CAR.02.03");
  assert.ok(stair.length > 0 && stair.every((entry) => entry.kind === "refused"));
  assert.match(String(stair[0].why), /not in the toolbox's works/);
  assert.ok(plan.materialsPayload.every((entry) => entry.work_item_id !== "w-CAR.02.03"));
});

test("a new mix takes the toolbox's spelling of its unit; a unit it lacks is refused alone", () => {
  const takeoff = read(
    file({
      mixes: [
        { work_code: "FD.14", mix: "Steel 16 mm", uom: "KG", qty: 3 },
        { work_code: "FD.14", mix: "Odd", uom: "furlong", qty: 1 },
      ],
    }),
  );
  const plan = planImport(takeoff, WORKS, null, [], UNITS);
  assert.deepEqual(plan.newMixes, [{ name: "Steel 16 mm", uom: "kg" }]);
  const odd = plan.materials.find((entry) => entry.mix === "Odd");
  assert.equal(odd?.kind, "refused");
  assert.match(String(odd?.why), /"furlong", a unit the toolbox doesn't have/);
  assert.deepEqual(
    plan.materialsPayload.map((entry) => entry.mix_uom),
    ["kg"],
  );
});
