/**
 * The revision-diff rules. What these protect: the numbers the Issue
 * dialog shows a designer ("3 added, 1 removed…") and — via the same
 * line_key matching — the budget team's confidence that "unchanged"
 * really means their pricing carries over untouched.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { diffLines, type DiffableLine } from "./diff";

const line = (key: string, quantity: number, space: string): DiffableLine => ({
  line_key: key,
  quantity,
  unit_space_id: space,
});

const spaces = new Map([
  ["living", "Living"],
  ["bed1", "Bedroom 1"],
]);

test("identical revisions are all unchanged", () => {
  const lines = [line("a", 2, "living"), line("b", 1, "bed1")];
  const diff = diffLines(lines, lines, spaces);
  assert.equal(diff.unchanged, 2);
  assert.equal(diff.entries.length, 0);
  assert.deepEqual([diff.added, diff.removed, diff.changed], [0, 0, 0]);
});

test("added, removed and changed are each detected once", () => {
  const previous = [
    line("keep", 2, "living"),
    line("resize", 1, "living"),
    line("gone", 3, "bed1"),
  ];
  const current = [line("keep", 2, "living"), line("resize", 4, "living"), line("new", 1, "bed1")];

  const diff = diffLines(previous, current, spaces);
  assert.deepEqual(
    [diff.added, diff.removed, diff.changed, diff.unchanged],
    [1, 1, 1, 1],
    "each line lands in exactly one bucket",
  );

  const changed = diff.entries.find((entry) => entry.kind === "changed");
  assert.ok(changed && changed.kind === "changed");
  assert.equal(changed.quantityChanged, true);
  assert.equal(changed.spaceChanged, false);
  assert.equal(changed.previous.quantity, 1, "the old figure survives for display");
});

test("moving a line to another space counts as changed, not added-plus-removed", () => {
  // The same line_key in a different room is one decision, not two — an
  // add+remove would tell the budget team to re-price it from scratch.
  const previous = [line("sofa", 1, "living")];
  const current = [line("sofa", 1, "bed1")];

  const diff = diffLines(previous, current, spaces);
  assert.deepEqual([diff.added, diff.removed, diff.changed], [0, 0, 1]);
  const entry = diff.entries[0];
  assert.ok(entry.kind === "changed");
  assert.equal(entry.spaceChanged, true);
  assert.equal(entry.quantityChanged, false);
  assert.equal(entry.space, "Bedroom 1", "labelled with where it moved TO");
});

test("a space the map doesn't know renders as a dash, not a crash", () => {
  const diff = diffLines([], [line("x", 1, "demolished")], spaces);
  assert.equal(diff.entries[0].space, "—");
});

test("a first revision against nothing is all additions", () => {
  const diff = diffLines([], [line("a", 1, "living"), line("b", 2, "bed1")], spaces);
  assert.deepEqual([diff.added, diff.removed, diff.changed, diff.unchanged], [2, 0, 0, 0]);
});
