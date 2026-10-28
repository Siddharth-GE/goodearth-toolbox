import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NO_VILLA,
  companyVillas,
  groupByVilla,
  headerVilla,
  spansProjects,
  villaChoices,
  villaFromValue,
  villaLabel,
  villaOfLine,
  villaValue,
} from "./villas";

const projects = [
  { id: "villas", name: "Saarang - Villas" },
  { id: "mob", name: "Saarang - Mobilisation" },
];
const plots = [
  { id: "p14", project_id: "villas", name: "Plot 14", code: "P14" },
  { id: "p25", project_id: "villas", name: "Plot 25", code: "P25" },
];
const units = [{ id: "u14", project_id: "villas", plot_id: "p14", name: "Villa 14", code: "V14" }];

test("every project offers the whole project first, then its places; a project with no plots only the whole", () => {
  const choices = villaChoices(projects, units, plots);
  assert.deepEqual(
    choices.map((choice) => choice.value),
    ["project:villas", "plot:p25", "unit:u14", "project:mob"],
  );
  assert.equal(choices[2].label, "Villa 14 (V14)");
  assert.equal(choices[3].projectName, "Saarang - Mobilisation");
});

test("a picked value is the line's villa with its project; an unknown one is none", () => {
  const choices = villaChoices(projects, units, plots);
  assert.deepEqual(villaFromValue("unit:u14", choices), {
    projectId: "villas",
    plotId: null,
    unitId: "u14",
  });
  assert.deepEqual(villaFromValue("plot:p25", choices), {
    projectId: "villas",
    plotId: "p25",
    unitId: null,
  });
  assert.deepEqual(villaFromValue("project:mob", choices), {
    projectId: "mob",
    plotId: null,
    unitId: null,
  });
  assert.deepEqual(villaFromValue("unit:gone", choices), NO_VILLA);
});

test("a plot with a unit reads as its unit, so a bill made on the plot shows in the picker", () => {
  const unitOfPlot = { p14: "u14" };
  assert.equal(
    villaValue({ projectId: "villas", plotId: "p14", unitId: null }, unitOfPlot),
    "unit:u14",
  );
  assert.equal(
    villaValue({ projectId: "villas", plotId: "p25", unitId: null }, unitOfPlot),
    "plot:p25",
  );
  assert.equal(
    villaValue({ projectId: "mob", plotId: null, unitId: null }, unitOfPlot),
    "project:mob",
  );
  assert.equal(villaValue(NO_VILLA, unitOfPlot), "");
});

test("a line with no villa is on the bill's", () => {
  const bill = { projectId: "villas", plotId: "p14", unitId: null };
  assert.deepEqual(villaOfLine(NO_VILLA, bill), bill);
  const own = { projectId: "mob", plotId: null, unitId: null };
  assert.deepEqual(villaOfLine(own, bill), own);
});

test("the header names a villa only when every line shares one in the bill's project", () => {
  const v14 = { projectId: "villas", plotId: null, unitId: "u14" };
  const p25 = { projectId: "villas", plotId: "p25", unitId: null };
  assert.deepEqual(headerVilla("villas", [v14, v14]), { plotId: null, unitId: "u14" });
  assert.deepEqual(headerVilla("villas", [v14, p25]), { plotId: null, unitId: null });
  assert.deepEqual(headerVilla("mob", [v14]), { plotId: null, unitId: null });
  assert.deepEqual(headerVilla("villas", [{ projectId: "villas", plotId: null, unitId: null }]), {
    plotId: null,
    unitId: null,
  });
  assert.deepEqual(headerVilla("villas", []), { plotId: null, unitId: null });
});

test("lines group by villa in the order they first appear, each with its subtotal to the paisa", () => {
  const bill = { projectId: "villas", plotId: null, unitId: "u14" };
  const lines = [
    { villa: NO_VILLA, amount: 900.105 },
    { villa: { projectId: "villas", plotId: "p25", unitId: null }, amount: 1100 },
    { villa: { projectId: "villas", plotId: null, unitId: "u14" }, amount: 450.2 },
  ];
  const groups = groupByVilla(
    lines,
    (line) => villaOfLine(line.villa, bill),
    (line) => line.amount,
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0].villa.unitId, "u14");
  assert.equal(groups[0].lines.length, 2);
  assert.equal(groups[0].total, 1350.31);
  assert.equal(groups[1].total, 1100);
});

test("a bill offers its own project first, then its company's others; a project with no company only itself", () => {
  const all = [
    { id: "villas", name: "Saarang - Villas", company_id: "ef" },
    { id: "infra", name: "Saarang - Infrastructure", company_id: "ed" },
    { id: "mob", name: "Saarang - Mobilisation", company_id: "ef" },
    { id: "baveli", name: "Baveli", company_id: null },
  ];
  const offered = companyVillas("mob", all, units, plots);
  assert.deepEqual(
    [...new Set(offered.choices.map((choice) => choice.projectId))],
    ["mob", "villas"],
  );
  assert.deepEqual(offered.unitOfPlot, { p14: "u14" });
  assert.deepEqual(
    [...new Set(companyVillas("baveli", all, units, plots).choices.map((c) => c.projectId))],
    ["baveli"],
  );
});

test("a villa's name carries its project only when asked, never twice for a whole project", () => {
  const offered = { choices: villaChoices(projects, units, plots), unitOfPlot: { p14: "u14" } };
  const p14 = { projectId: "villas", plotId: "p14", unitId: null };
  const mob = { projectId: "mob", plotId: null, unitId: null };
  assert.equal(villaLabel(p14, offered), "Villa 14 (V14)");
  assert.equal(villaLabel(p14, offered, true), "Villa 14 (V14) · Saarang - Villas");
  assert.equal(villaLabel(mob, offered, true), "Whole project — Saarang - Mobilisation");
  assert.equal(spansProjects([p14, mob]), true);
  assert.equal(spansProjects([p14, p14]), false);
});
