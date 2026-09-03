/**
 * Pins the pure rules both /court and /trail lean on: what scope a
 * linked space narrows to, which rows are "in" it, how a typed search
 * turns into words, the ten-cap, and the app's own coldest-first order.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CARD_LIMIT,
  inScope,
  matchesWords,
  orderColdestFirst,
  scopeOf,
  searchWords,
  splitByScope,
  takeForCard,
  type Scope,
  type TrailSummary,
} from "./trail-rules";
import type { SpaceLink } from "./spaces";

function row(overrides: Partial<TrailSummary> = {}): TrailSummary {
  return {
    chainId: "c1",
    projectId: "p-saarang",
    projectName: "Saarang",
    unitId: "u-villa-12",
    unitName: "Villa 12",
    activityName: "Structural drawings",
    title: null,
    currentLeg: 2,
    legCount: 5,
    legLabel: "Structural drawings",
    holderName: "Anil",
    daysInLeg: 4,
    expectedDays: 3,
    isStuck: true,
    isWithClient: false,
    withClientDays: 0,
    ...overrides,
  };
}

test("scopeOf: a unit link scopes to that unit", () => {
  const link: SpaceLink = {
    projectId: "p-saarang",
    unitId: "u-villa-12",
    label: "Saarang · Villa 12",
  };
  assert.deepEqual(scopeOf(link), { kind: "unit", unitId: "u-villa-12" });
});

test("scopeOf: a project-only link scopes to the project", () => {
  const link: SpaceLink = {
    projectId: "p-saarang",
    unitId: null,
    label: "Saarang (whole project)",
  };
  assert.deepEqual(scopeOf(link), { kind: "project", projectId: "p-saarang" });
});

test("scopeOf: no link spans everything", () => {
  assert.deepEqual(scopeOf(null), { kind: "all" });
});

test("inScope: all matches every row", () => {
  assert.equal(inScope(row(), { kind: "all" }), true);
});

test("inScope: a unit scope only matches its own unit", () => {
  const scope: Scope = { kind: "unit", unitId: "u-villa-12" };
  assert.equal(inScope(row({ unitId: "u-villa-12" }), scope), true);
  assert.equal(inScope(row({ unitId: "u-villa-1" }), scope), false);
  assert.equal(inScope(row({ unitId: null }), scope), false);
});

test("inScope: a project scope matches every row under it, villa or not", () => {
  const scope: Scope = { kind: "project", projectId: "p-saarang" };
  assert.equal(inScope(row({ projectId: "p-saarang", unitId: "u-villa-1" }), scope), true);
  assert.equal(inScope(row({ projectId: "p-saarang", unitId: null }), scope), true);
  assert.equal(inScope(row({ projectId: "p-baveli" }), scope), false);
});

test("splitByScope: in-scope and elsewhere never overlap or drop a row", () => {
  const scope: Scope = { kind: "unit", unitId: "u-villa-12" };
  const rows = [
    row({ chainId: "c1", unitId: "u-villa-12" }),
    row({ chainId: "c2", unitId: "u-villa-1" }),
    row({ chainId: "c3", unitId: "u-villa-12" }),
  ];
  const { inScope: matched, elsewhere } = splitByScope(rows, scope);
  assert.deepEqual(
    matched.map((r) => r.chainId),
    ["c1", "c3"],
  );
  assert.deepEqual(
    elsewhere.map((r) => r.chainId),
    ["c2"],
  );
});

test("searchWords: blank input is no words", () => {
  assert.deepEqual(searchWords(""), []);
  assert.deepEqual(searchWords("   "), []);
});

test("searchWords: punctuation is a gap, not a word", () => {
  assert.deepEqual(searchWords("villa-12, structural!"), ["villa", "12", "structural"]);
});

test("searchWords: mixed case is lower-cased", () => {
  assert.deepEqual(searchWords("Villa 12"), ["villa", "12"]);
});

test("matchesWords: every word must be a substring somewhere in the row", () => {
  const r = row({
    projectName: "Saarang",
    unitName: "Villa 12",
    activityName: "Structural drawings",
    title: "Foundation plan",
  });
  assert.equal(matchesWords(r, ["villa", "12"]), true);
  assert.equal(matchesWords(r, ["structural"]), true);
  assert.equal(matchesWords(r, ["foundation"]), true);
  assert.equal(matchesWords(r, ["villa", "13"]), false);
});

test("matchesWords: no words matches everything", () => {
  assert.equal(matchesWords(row(), []), true);
});

test("matchesWords: a null unit or title never breaks the search", () => {
  const r = row({ unitName: null, title: null, projectName: "Saarang" });
  assert.equal(matchesWords(r, ["saarang"]), true);
  assert.equal(matchesWords(r, ["villa"]), false);
});

test("takeForCard: the ten-cap and the leftover count", () => {
  const rows = Array.from({ length: 13 }, (_, i) => row({ chainId: `c${i}` }));
  const { shown, more } = takeForCard(rows);
  assert.equal(shown.length, CARD_LIMIT);
  assert.equal(more, 3);
  assert.deepEqual(
    shown.map((r) => r.chainId),
    rows.slice(0, 10).map((r) => r.chainId),
  );
});

test("takeForCard: fewer than the cap leaves nothing over", () => {
  const rows = [row({ chainId: "c1" }), row({ chainId: "c2" })];
  const { shown, more } = takeForCard(rows);
  assert.equal(shown.length, 2);
  assert.equal(more, 0);
});

test("orderColdestFirst: stuck rows sort before on-time ones", () => {
  const rows = [
    row({ chainId: "cold", isStuck: false, daysInLeg: 10 }),
    row({ chainId: "hot", isStuck: true, daysInLeg: 1 }),
  ];
  assert.deepEqual(
    orderColdestFirst(rows).map((r) => r.chainId),
    ["hot", "cold"],
  );
});

test("orderColdestFirst: within the same stuck-ness, longest waiting first", () => {
  const rows = [
    row({ chainId: "a", isStuck: true, daysInLeg: 2 }),
    row({ chainId: "b", isStuck: true, daysInLeg: 9 }),
  ];
  assert.deepEqual(
    orderColdestFirst(rows).map((r) => r.chainId),
    ["b", "a"],
  );
});

test("orderColdestFirst: a tie falls back to chainId, ascending", () => {
  const rows = [
    row({ chainId: "c2", isStuck: true, daysInLeg: 5 }),
    row({ chainId: "c1", isStuck: true, daysInLeg: 5 }),
  ];
  assert.deepEqual(
    orderColdestFirst(rows).map((r) => r.chainId),
    ["c1", "c2"],
  );
});

test("orderColdestFirst returns a new array, leaving the input untouched", () => {
  const rows = [row({ chainId: "b", daysInLeg: 1 }), row({ chainId: "a", daysInLeg: 9 })];
  const ordered = orderColdestFirst(rows);
  assert.notEqual(ordered, rows);
  assert.deepEqual(
    rows.map((r) => r.chainId),
    ["b", "a"],
  );
});
