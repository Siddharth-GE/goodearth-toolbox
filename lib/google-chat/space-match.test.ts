/**
 * The space-name rule, pinned example by example from plan.md's Phase 4.
 * The one that matters most is "Saarang Villa 12" never landing on Villa
 * 1: a wrong link is worse than no link, because every later command in
 * that space would quietly scope to the wrong villa.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  linkTargetRows,
  matchSpaceName,
  parseLinkValue,
  projectLabel,
  unitLabel,
  unitRows,
  type MatchProject,
  type MatchUnit,
} from "./space-match";

const PROJECTS: MatchProject[] = [
  { id: "p-saarang", name: "Saarang", code: "SAA" },
  { id: "p-baveli", name: "Baveli", code: "BAV" },
];

const UNITS: MatchUnit[] = [
  { id: "u-villa-1", name: "Villa 1", code: "V1", projectId: "p-saarang" },
  { id: "u-villa-12", name: "Villa 12", code: "V12", projectId: "p-saarang" },
  { id: "u-villa-13", name: "Villa 13", code: "V13", projectId: "p-saarang" },
  { id: "u-baveli-1", name: "1", code: null, projectId: "p-baveli" },
];

const match = (displayName: string) => matchSpaceName(displayName, UNITS, PROJECTS);

test("a space named after a villa links to that villa, never a shorter one", () => {
  assert.deepEqual(match("Saarang Villa 12"), {
    kind: "unit",
    unitId: "u-villa-12",
    projectId: "p-saarang",
  });
});

test("the villa's name can sit anywhere in the space's name", () => {
  assert.deepEqual(match("Villa 12 - site chat"), {
    kind: "unit",
    unitId: "u-villa-12",
    projectId: "p-saarang",
  });
});

test("a villa code as one word of the name is enough", () => {
  assert.deepEqual(match("V12 updates"), {
    kind: "unit",
    unitId: "u-villa-12",
    projectId: "p-saarang",
  });
});

test("a project's name links the whole project", () => {
  assert.deepEqual(match("Saarang"), { kind: "project", projectId: "p-saarang" });
  assert.deepEqual(match("SAA weekly"), { kind: "project", projectId: "p-saarang" });
});

test("a villa named just by its number is found under its project", () => {
  assert.deepEqual(match("Baveli 1"), {
    kind: "unit",
    unitId: "u-baveli-1",
    projectId: "p-baveli",
  });
});

test("a name that fits several villas is ambiguous, not the first one found", () => {
  assert.deepEqual(match("Villa"), { kind: "ambiguous", count: 3 });
});

test("a space about neither is left unlinked", () => {
  assert.deepEqual(match("Design team"), { kind: "none" });
  assert.deepEqual(match(""), { kind: "none" });
  assert.deepEqual(match("   -  "), { kind: "none" });
});

test("matching ignores case and punctuation", () => {
  assert.deepEqual(match("saarang_villa_12!"), {
    kind: "unit",
    unitId: "u-villa-12",
    projectId: "p-saarang",
  });
});

test("labels read the way the bot says them out loud", () => {
  assert.equal(unitLabel("Saarang", "Villa 12"), "Saarang · Villa 12");
  assert.equal(projectLabel("Saarang"), "Saarang (whole project)");
});

test("the dropdown lists not-linked first, then projects, then villas", () => {
  const rows = linkTargetRows(PROJECTS, UNITS);

  assert.deepEqual(rows[0], {
    value: "none",
    text: "Not linked — commands here span everything",
  });
  assert.deepEqual(
    rows.slice(1, 3).map((row) => row.text),
    ["Baveli (whole project)", "Saarang (whole project)"],
  );
  assert.deepEqual(
    rows.slice(3).map((row) => row.text),
    ["Baveli · 1", "Saarang · Villa 1", "Saarang · Villa 12", "Saarang · Villa 13"],
  );
  assert.equal(rows.find((row) => row.text === "Saarang · Villa 12")?.value, "unit:u-villa-12");
  assert.equal(
    rows.find((row) => row.text === "Baveli (whole project)")?.value,
    "project:p-baveli",
  );
});

test("villa numbers sort as numbers", () => {
  const rows = linkTargetRows(PROJECTS, [
    { id: "u-2", name: "Villa 2", code: null, projectId: "p-saarang" },
    { id: "u-12", name: "Villa 12", code: null, projectId: "p-saarang" },
  ]);
  assert.deepEqual(
    rows.slice(3).map((row) => row.text),
    ["Saarang · Villa 2", "Saarang · Villa 12"],
  );
});

test("unitRows: every villa, value the bare unit id, text the same label the bot always uses", () => {
  const rows = unitRows(PROJECTS, UNITS);
  assert.deepEqual(rows, [
    { value: "u-baveli-1", text: "Baveli · 1" },
    { value: "u-villa-1", text: "Saarang · Villa 1" },
    { value: "u-villa-12", text: "Saarang · Villa 12" },
    { value: "u-villa-13", text: "Saarang · Villa 13" },
  ]);
});

test("unitRows: sorted by label, so villa numbers sort as numbers", () => {
  const rows = unitRows(PROJECTS, [
    { id: "u-2", name: "Villa 2", code: null, projectId: "p-saarang" },
    { id: "u-12", name: "Villa 12", code: null, projectId: "p-saarang" },
  ]);
  assert.deepEqual(
    rows.map((row) => row.text),
    ["Saarang · Villa 2", "Saarang · Villa 12"],
  );
});

test("unitRows: a unit with no matching project is skipped, not shown blank", () => {
  const rows = unitRows(PROJECTS, [
    ...UNITS,
    { id: "u-orphan", name: "Orphan villa", code: null, projectId: "p-nowhere" },
  ]);
  assert.equal(
    rows.some((row) => row.value === "u-orphan"),
    false,
  );
  assert.equal(rows.length, UNITS.length);
});

test("a submitted value is read back, and nonsense is refused", () => {
  assert.deepEqual(parseLinkValue("none"), { kind: "none" });
  assert.deepEqual(parseLinkValue("project:p-saarang"), { kind: "project", id: "p-saarang" });
  assert.deepEqual(parseLinkValue("unit:u-villa-12"), { kind: "unit", id: "u-villa-12" });
  assert.equal(parseLinkValue(null), null);
  assert.equal(parseLinkValue(""), null);
  assert.equal(parseLinkValue("unit:"), null);
  assert.equal(parseLinkValue("something else"), null);
});
