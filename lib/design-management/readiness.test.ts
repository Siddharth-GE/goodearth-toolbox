/**
 * The ready-to-issue line mirrors issue_transmittal's three refusals
 * (0093, widened by 0124), in the same order. If the migration's order
 * ever changes, these tests are the place that should break first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { transmittalReadiness, type ReadinessLine } from "./readiness";

const line = (overrides: Partial<ReadinessLine> = {}): ReadinessLine => ({
  setName: "Working Drawings",
  revisionNo: 0,
  revisionStatus: "draft",
  fileCount: 0,
  hasLink: true,
  note: null,
  ...overrides,
});

test("an empty transmittal is not ready", () => {
  assert.deepEqual(transmittalReadiness([]), {
    ready: false,
    problem: "Add at least one drawing before issuing.",
  });
});

test("an R0 with a WorkDrive link and no note is ready", () => {
  assert.deepEqual(transmittalReadiness([line()]), { ready: true, problem: null });
});

test("an R0 with uploaded sheets and no link is ready, as before 0124", () => {
  assert.equal(transmittalReadiness([line({ hasLink: false, fileCount: 9 })]).ready, true);
});

test("a drawing with neither a link nor a sheet is named", () => {
  const result = transmittalReadiness([line({ setName: "Structural", hasLink: false })]);
  assert.equal(result.problem, '"Structural" R0 has no WorkDrive link yet.');
});

test("a re-sent released drawing with nothing is refused too", () => {
  const result = transmittalReadiness([line({ revisionStatus: "released", hasLink: false })]);
  assert.equal(result.ready, false);
});

test("an R1 draft needs a note; whitespace is not a note", () => {
  const result = transmittalReadiness([line({ revisionNo: 1, note: "   " })]);
  assert.equal(result.problem, '"Working Drawings" R1 needs a note saying what changed.');
  assert.equal(transmittalReadiness([line({ revisionNo: 1, note: "Stair moved" })]).ready, true);
});

test("a set brought in from Excel at R3 needs its note too", () => {
  const result = transmittalReadiness([line({ revisionNo: 3, note: null })]);
  assert.equal(result.problem, '"Working Drawings" R3 needs a note saying what changed.');
});

test("a released R2 sent again needs no new note", () => {
  const result = transmittalReadiness([line({ revisionNo: 2, revisionStatus: "released" })]);
  assert.equal(result.ready, true);
});

test("missing drawings are reported before a missing note, as the database does", () => {
  const result = transmittalReadiness([
    line({ setName: "A", revisionNo: 1, note: null }),
    line({ setName: "B", hasLink: false }),
  ]);
  assert.equal(result.problem, '"B" R0 has no WorkDrive link yet.');
});

test("the first problem in sheet order is the one named", () => {
  const result = transmittalReadiness([
    line({ setName: "A", hasLink: false }),
    line({ setName: "B", hasLink: false }),
  ]);
  assert.equal(result.problem, '"A" R0 has no WorkDrive link yet.');
});
