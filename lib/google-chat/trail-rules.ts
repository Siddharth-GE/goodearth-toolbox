import type { SpaceLink } from "./spaces";

/**
 * The one row shape both /court and /trail read, and the pure rules that
 * turn a flat list of them into what a card should say: which scope a
 * linked space narrows to, whether a row belongs to it, which words a
 * search typed after /trail actually means, and the order the app itself
 * uses (coldest first).
 *
 * `SpaceLink` comes in by type only — this file may import nothing that
 * touches I/O, so it stays runnable by `tsx --test` the way
 * identity-rules.ts and space-match.ts do. `relay-reads.ts` is the half
 * that fetches; this half only decides.
 */

/** A trail, boiled down to what a chat card needs to say about it. */
export type TrailSummary = {
  chainId: string;
  projectId: string;
  projectName: string;
  unitId: string | null;
  unitName: string | null;
  activityName: string;
  title: string | null;
  currentLeg: number | null;
  legCount: number;
  legLabel: string | null;
  holderName: string | null;
  daysInLeg: number;
  expectedDays: number;
  isStuck: boolean;
  isWithClient: boolean;
  withClientDays: number;
};

/**
 * What a command defaults to. A space linked to one villa scopes to that
 * villa; linked to a whole project scopes to every villa (and the
 * project's own trails) under it; a DM or an unlinked space spans
 * everything.
 */
export type Scope =
  { kind: "all" } | { kind: "project"; projectId: string } | { kind: "unit"; unitId: string };

/** A space's link, turned into the scope its commands default to. */
export function scopeOf(link: SpaceLink | null): Scope {
  if (!link) return { kind: "all" };
  if (link.unitId) return { kind: "unit", unitId: link.unitId };
  return { kind: "project", projectId: link.projectId };
}

/** Does this row belong to the scope? "all" belongs to everything. */
export function inScope(row: TrailSummary, scope: Scope): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "unit") return row.unitId === scope.unitId;
  return row.projectId === scope.projectId;
}

/**
 * A linked space's court needs both halves of the answer at once: what
 * is in scope, and how many the sender holds elsewhere — so this reads
 * the unscoped list once and splits it here, rather than the door
 * needing a second read to say "and N more outside this space".
 */
export function splitByScope(
  rows: TrailSummary[],
  scope: Scope,
): { inScope: TrailSummary[]; elsewhere: TrailSummary[] } {
  const matched: TrailSummary[] = [];
  const rest: TrailSummary[] = [];
  for (const row of rows) {
    if (inScope(row, scope)) matched.push(row);
    else rest.push(row);
  }
  return { inScope: matched, elsewhere: rest };
}

/**
 * Words typed after /trail, lower-cased and stripped of punctuation —
 * the same idea as space-match.ts's `tokens()`, but the words feed a
 * different rule below (every word must appear, not a contiguous run),
 * so it is restated here rather than imported across files that both
 * promise to import nothing.
 */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Does this row match every one of the search words? Each word only has
 * to be a substring somewhere in the row's name fields — "villa 12"
 * finds "Villa 12 — Structural drawings"; "12" alone finds every villa
 * with a 12 in it, which is fine, because the card only ever shows the
 * first ten. No words at all matches everything.
 */
export function matchesWords(row: TrailSummary, words: string[]): boolean {
  if (words.length === 0) return true;
  const haystack = [row.projectName, row.unitName, row.activityName, row.title]
    .map((part) => part ?? "")
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * The app's own order, restated once in Node: cold first, then the
 * longest-waiting, then a stable tiebreaker — because the court is split
 * by scope here, after the database has already answered, rather than
 * ordered by a second query.
 */
export function orderColdestFirst(rows: TrailSummary[]): TrailSummary[] {
  return [...rows].sort((a, b) => {
    if (a.isStuck !== b.isStuck) return a.isStuck ? -1 : 1;
    if (a.daysInLeg !== b.daysInLeg) return b.daysInLeg - a.daysInLeg;
    return a.chainId.localeCompare(b.chainId);
  });
}

/** A card never lists more than this many rows — the rest are "and N more". */
export const CARD_LIMIT = 10;

/** The first ten rows for a card, and how many were left off. */
export function takeForCard(rows: TrailSummary[]): { shown: TrailSummary[]; more: number } {
  return { shown: rows.slice(0, CARD_LIMIT), more: Math.max(0, rows.length - CARD_LIMIT) };
}

// --- Phase 6/7: buttons, the bounce reasons and the three form parsers ---

/** The five things a court-card button can offer for one trail. */
export type ButtonAction = "push" | "finish" | "bounce" | "hold" | "return";

const BUTTON_ACTIONS: readonly ButtonAction[] = ["push", "finish", "bounce", "hold", "return"];

/**
 * Which buttons a row's card gets — the app's own MoveBatonButtons rules
 * (app/(dashboard)/relay/_components/move-baton.tsx) restated for a chat
 * card: push while there's a leg ahead, finish on the last leg, bounce
 * once the baton has moved past the first leg, and exactly one of
 * hold/return depending on whether the client currently has it. A queued
 * trail (`currentLeg` null) gets nothing — there is no baton yet for a
 * button here to move.
 *
 * Order matters: it's the order the buttons render in, push first.
 */
export function buttonsFor(row: TrailSummary): ButtonAction[] {
  if (row.currentLeg === null) return [];
  const actions: ButtonAction[] = [];
  if (row.currentLeg < row.legCount) actions.push("push");
  if (row.currentLeg === row.legCount) actions.push("finish");
  if (row.currentLeg > 1) actions.push("bounce");
  actions.push(row.isWithClient ? "return" : "hold");
  return actions;
}

/**
 * The 0036 bounce reasons, in the order the dropdown renders them — same
 * five as the app's own BOUNCE_REASONS (lib/relay/events.ts), reworded
 * for a one-line dropdown row rather than a chip.
 */
export const BOUNCE_REASONS: { value: string; text: string }[] = [
  { value: "rework", text: "Rework needed" },
  { value: "missing_info", text: "Missing information" },
  { value: "wrong_person", text: "Wrong person" },
  { value: "client_change", text: "Client changed something" },
  { value: "other", text: "Other" },
];

/** A reason's dropdown text, or the raw value when it isn't one of the five. */
export function bounceReasonText(value: string): string {
  return BOUNCE_REASONS.find((r) => r.value === value)?.text ?? value;
}

/** What a court-card button's parameters name: which action, which trail, which leg it was pressed from. */
export type ButtonPress = { action: ButtonAction; chainId: string; fromLeg: number };

/**
 * A button press, read back from its parameters. Anything that doesn't
 * shape up as a real press — an action outside the five, a blank chain
 * id, a leg that isn't a positive whole number — is null, so a stale or
 * tampered card is refused politely rather than acted on as a guess.
 */
export function parseButton(params: Record<string, string>): ButtonPress | null {
  const action = params.action;
  if (!BUTTON_ACTIONS.includes(action as ButtonAction)) return null;

  const chainId = params.chain;
  if (!chainId) return null;

  const legRaw = params.leg ?? "";
  if (!/^[1-9]\d*$/.test(legRaw)) return null;

  return { action: action as ButtonAction, chainId, fromLeg: Number(legRaw) };
}

/**
 * The bounce dialog's three fields, checked in the same order and the
 * same words as bounceBaton (lib/relay/actions.ts) — the database
 * refuses the same three things (migration 0036 §6), so the dialog can
 * say so without a round trip that would read like a crash.
 */
export function parseBounceForm(
  values: { toLeg: string | null; reason: string | null; note: string | null },
  fromLeg: number,
): { ok: true; toLeg: number; reason: string; note: string } | { ok: false; error: string } {
  const reason = values.reason ?? "";
  if (!BOUNCE_REASONS.some((r) => r.value === reason)) {
    return { ok: false, error: "Pick a reason — a bounce is never silent." };
  }

  const note = (values.note ?? "").trim();
  if (!note) {
    return { ok: false, error: "Say what needs to change before it comes back." };
  }

  const toLegRaw = values.toLeg ?? "";
  const toLeg = /^[1-9]\d*$/.test(toLegRaw) ? Number(toLegRaw) : NaN;
  if (!Number.isInteger(toLeg) || toLeg >= fromLeg) {
    return { ok: false, error: "A bounce goes backwards, to a leg the trail has passed." };
  }

  return { ok: true, toLeg, reason, note };
}

/**
 * The new-trail dialog's two required pickers, plus the start toggle —
 * the toggle has no wrong answer, so it never produces an error.
 */
export function parseNewTrailForm(values: {
  unit: string | null;
  set: string | null;
  start: string | null;
}): { ok: true; unitId: string; setId: string; start: boolean } | { ok: false; error: string } {
  const unitId = (values.unit ?? "").trim();
  if (!unitId) return { ok: false, error: "Pick a house first." };

  const setId = (values.set ?? "").trim();
  if (!setId) return { ok: false, error: "Pick a trail type first." };

  return { ok: true, unitId, setId, start: values.start !== null };
}

/** One trail type, for the /newtrail dialog's "Trail type" dropdown. */
export type TrailSetOption = { id: string; name: string };

/** One leg, for the /bounce dialog's "Send it back to" dropdown. */
export type LegOption = { legNo: number; label: string | null; assigneeName: string | null };
