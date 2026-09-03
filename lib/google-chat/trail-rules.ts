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
