/**
 * Pins the pure rules both /court and /trail lean on: what scope a
 * linked space narrows to, which rows are "in" it, how a typed search
 * turns into words, the ten-cap, and the app's own coldest-first order.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BOUNCE_REASONS,
  CARD_LIMIT,
  bounceReasonText,
  buttonsFor,
  inScope,
  matchesWords,
  orderColdestFirst,
  parseBounceForm,
  parseButton,
  parseNewTrailForm,
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

// --- Phase 6/7: buttonsFor, BOUNCE_REASONS, parseButton, the two forms --

test("buttonsFor: a queued trail (no current leg) offers nothing", () => {
  assert.deepEqual(buttonsFor(row({ currentLeg: null })), []);
});

test("buttonsFor: mid-trail, not with the client — push, bounce, hold", () => {
  assert.deepEqual(buttonsFor(row({ currentLeg: 2, legCount: 5, isWithClient: false })), [
    "push",
    "bounce",
    "hold",
  ]);
});

test("buttonsFor: the first leg has nothing to bounce to", () => {
  assert.deepEqual(buttonsFor(row({ currentLeg: 1, legCount: 5, isWithClient: false })), [
    "push",
    "hold",
  ]);
});

test("buttonsFor: the last leg offers finish instead of push", () => {
  assert.deepEqual(buttonsFor(row({ currentLeg: 5, legCount: 5, isWithClient: false })), [
    "finish",
    "bounce",
    "hold",
  ]);
});

test("buttonsFor: a single-leg trail on its only leg offers finish alone plus hold", () => {
  assert.deepEqual(buttonsFor(row({ currentLeg: 1, legCount: 1, isWithClient: false })), [
    "finish",
    "hold",
  ]);
});

test("buttonsFor: with the client swaps hold for return, order otherwise unchanged", () => {
  assert.deepEqual(buttonsFor(row({ currentLeg: 3, legCount: 5, isWithClient: true })), [
    "push",
    "bounce",
    "return",
  ]);
});

test("BOUNCE_REASONS: the five reasons, in order, in the chat app's words", () => {
  assert.deepEqual(BOUNCE_REASONS, [
    { value: "rework", text: "Rework needed" },
    { value: "missing_info", text: "Missing information" },
    { value: "wrong_person", text: "Wrong person" },
    { value: "client_change", text: "Client changed something" },
    { value: "other", text: "Other" },
  ]);
});

test("bounceReasonText: a known value, and the value itself when unknown", () => {
  assert.equal(bounceReasonText("rework"), "Rework needed");
  assert.equal(bounceReasonText("client_change"), "Client changed something");
  assert.equal(bounceReasonText("something-nobody-declared"), "something-nobody-declared");
});

test("parseButton: a well-formed press", () => {
  assert.deepEqual(parseButton({ action: "push", chain: "c1", leg: "3" }), {
    action: "push",
    chainId: "c1",
    fromLeg: 3,
  });
});

test("parseButton: every declared action parses", () => {
  for (const action of ["push", "finish", "bounce", "hold", "return"]) {
    assert.equal(parseButton({ action, chain: "c1", leg: "1" })?.action, action);
  }
});

test("parseButton: an action outside the five is refused", () => {
  assert.equal(parseButton({ action: "hand", chain: "c1", leg: "1" }), null);
  assert.equal(parseButton({ chain: "c1", leg: "1" }), null);
});

test("parseButton: a blank chain id is refused", () => {
  assert.equal(parseButton({ action: "push", chain: "", leg: "1" }), null);
  assert.equal(parseButton({ action: "push", leg: "1" }), null);
});

test("parseButton: the leg must be a positive whole number, not zero, negative or text", () => {
  assert.equal(parseButton({ action: "push", chain: "c1", leg: "0" }), null);
  assert.equal(parseButton({ action: "push", chain: "c1", leg: "-1" }), null);
  assert.equal(parseButton({ action: "push", chain: "c1", leg: "1.5" }), null);
  assert.equal(parseButton({ action: "push", chain: "c1", leg: "three" }), null);
  assert.equal(parseButton({ action: "push", chain: "c1", leg: "" }), null);
  assert.equal(parseButton({ action: "push", chain: "c1" }), null);
});

test("parseBounceForm: a well-formed bounce", () => {
  assert.deepEqual(
    parseBounceForm({ toLeg: "1", reason: "rework", note: "Wrong finish colour" }, 3),
    { ok: true, toLeg: 1, reason: "rework", note: "Wrong finish colour" },
  );
});

test("parseBounceForm: no reason, or an unknown one, is refused first", () => {
  assert.deepEqual(parseBounceForm({ toLeg: "1", reason: null, note: "note" }, 3), {
    ok: false,
    error: "Pick a reason — a bounce is never silent.",
  });
  assert.deepEqual(parseBounceForm({ toLeg: "1", reason: "not-a-reason", note: "note" }, 3), {
    ok: false,
    error: "Pick a reason — a bounce is never silent.",
  });
});

test("parseBounceForm: a blank note is refused, checked after the reason", () => {
  assert.deepEqual(parseBounceForm({ toLeg: "1", reason: "rework", note: null }, 3), {
    ok: false,
    error: "Say what needs to change before it comes back.",
  });
  assert.deepEqual(parseBounceForm({ toLeg: "1", reason: "rework", note: "   " }, 3), {
    ok: false,
    error: "Say what needs to change before it comes back.",
  });
});

test("parseBounceForm: the target leg must be behind the current one", () => {
  assert.deepEqual(parseBounceForm({ toLeg: "3", reason: "rework", note: "note" }, 3), {
    ok: false,
    error: "A bounce goes backwards, to a leg the trail has passed.",
  });
  assert.deepEqual(parseBounceForm({ toLeg: "4", reason: "rework", note: "note" }, 3), {
    ok: false,
    error: "A bounce goes backwards, to a leg the trail has passed.",
  });
});

test("parseBounceForm: the target leg must be a real leg number, not zero, text or blank", () => {
  assert.deepEqual(parseBounceForm({ toLeg: "0", reason: "rework", note: "note" }, 3).ok, false);
  assert.deepEqual(parseBounceForm({ toLeg: "abc", reason: "rework", note: "note" }, 3).ok, false);
  assert.deepEqual(parseBounceForm({ toLeg: null, reason: "rework", note: "note" }, 3).ok, false);
});

test("parseNewTrailForm: unit and set picked, start on", () => {
  assert.deepEqual(parseNewTrailForm({ unit: "u1", set: "s1", start: "on" }), {
    ok: true,
    unitId: "u1",
    setId: "s1",
    start: true,
  });
});

test("parseNewTrailForm: start is off — the switch was left unset", () => {
  assert.deepEqual(parseNewTrailForm({ unit: "u1", set: "s1", start: null }), {
    ok: true,
    unitId: "u1",
    setId: "s1",
    start: false,
  });
});

test("parseNewTrailForm: no house is refused before the trail type", () => {
  assert.deepEqual(parseNewTrailForm({ unit: null, set: "s1", start: null }), {
    ok: false,
    error: "Pick a house first.",
  });
  assert.deepEqual(parseNewTrailForm({ unit: "", set: "s1", start: null }), {
    ok: false,
    error: "Pick a house first.",
  });
});

test("parseNewTrailForm: no trail type is refused once a house is picked", () => {
  assert.deepEqual(parseNewTrailForm({ unit: "u1", set: null, start: null }), {
    ok: false,
    error: "Pick a trail type first.",
  });
});
