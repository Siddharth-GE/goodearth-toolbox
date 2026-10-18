import type { SpaceLink } from "./spaces";

// Pure rules over the row both /court and /trail read. Imports nothing that touches I/O
// (`SpaceLink` is type-only), so tsx --test runs it. relay-reads.ts fetches; this decides.

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

// A DM or an unlinked space spans everything; a project link includes its villas and its own trails.
export type Scope =
  { kind: "all" } | { kind: "project"; projectId: string } | { kind: "unit"; unitId: string };

export function scopeOf(link: SpaceLink | null): Scope {
  if (!link) return { kind: "all" };
  if (link.unitId) return { kind: "unit", unitId: link.unitId };
  return { kind: "project", projectId: link.projectId };
}

export function inScope(row: TrailSummary, scope: Scope): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "unit") return row.unitId === scope.unitId;
  return row.projectId === scope.projectId;
}

// One unscoped read split here, so the card can say "N more outside this space" without a second query.
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

// Restated, not imported from space-match.ts: both files import nothing. Here every word must
// appear, not a contiguous run.
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Each word need only be a substring of a name field. No words matches everything.
export function matchesWords(row: TrailSummary, words: string[]): boolean {
  if (words.length === 0) return true;
  const haystack = [row.projectName, row.unitName, row.activityName, row.title]
    .map((part) => part ?? "")
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

// The app's own order restated in Node: the court is split by scope after the database answered.
export function orderColdestFirst(rows: TrailSummary[]): TrailSummary[] {
  return [...rows].sort((a, b) => {
    if (a.isStuck !== b.isStuck) return a.isStuck ? -1 : 1;
    if (a.daysInLeg !== b.daysInLeg) return b.daysInLeg - a.daysInLeg;
    return a.chainId.localeCompare(b.chainId);
  });
}

export const CARD_LIMIT = 10;

export function takeForCard(rows: TrailSummary[]): { shown: TrailSummary[]; more: number } {
  return { shown: rows.slice(0, CARD_LIMIT), more: Math.max(0, rows.length - CARD_LIMIT) };
}

/** The five things a court-card button can offer for one trail. */
export type ButtonAction = "push" | "finish" | "bounce" | "hold" | "return";

const BUTTON_ACTIONS: readonly ButtonAction[] = ["push", "finish", "bounce", "hold", "return"];

// The app's MoveBatonButtons rules (relay/_components/move-baton.tsx). A queued trail has no
// baton to move. The order is the render order.
export function buttonsFor(row: TrailSummary): ButtonAction[] {
  if (row.currentLeg === null) return [];
  const actions: ButtonAction[] = [];
  if (row.currentLeg < row.legCount) actions.push("push");
  if (row.currentLeg === row.legCount) actions.push("finish");
  if (row.currentLeg > 1) actions.push("bounce");
  actions.push(row.isWithClient ? "return" : "hold");
  return actions;
}

// The same five as lib/relay/events.ts BOUNCE_REASONS, worded for a dropdown row.
export const BOUNCE_REASONS: { value: string; text: string }[] = [
  { value: "rework", text: "Rework needed" },
  { value: "missing_info", text: "Missing information" },
  { value: "wrong_person", text: "Wrong person" },
  { value: "client_change", text: "Client changed something" },
  { value: "other", text: "Other" },
];

export function bounceReasonText(value: string): string {
  return BOUNCE_REASONS.find((r) => r.value === value)?.text ?? value;
}

export type ButtonPress = { action: ButtonAction; chainId: string; fromLeg: number };

// Anything that isn't a real press is null, so a stale or tampered card is refused, not guessed at.
export function parseButton(params: Record<string, string>): ButtonPress | null {
  const action = params.action;
  if (!BUTTON_ACTIONS.includes(action as ButtonAction)) return null;

  const chainId = params.chain;
  if (!chainId) return null;

  const legRaw = params.leg ?? "";
  if (!/^[1-9]\d*$/.test(legRaw)) return null;

  return { action: action as ButtonAction, chainId, fromLeg: Number(legRaw) };
}

// Same checks and words as bounceBaton (lib/relay/actions.ts); the database refuses the same three (0036 §6).
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

export type TrailSetOption = { id: string; name: string };

export type LegOption = { legNo: number; label: string | null; assigneeName: string | null };

// Never a real trail_sets id, so parseNewTrailPage can tell it apart without a database trip.
export const CUSTOM_SET = "custom";

// A longer trail is a trail type's job. A Chat dialog can't grow a row once open, so the count
// is chosen on page 1 and this is the ceiling that dropdown offers.
export const MAX_CUSTOM_STEPS = 10;

export const DEFAULT_CUSTOM_STEPS = 4;

// Never fails: a dialog refusing to open over an odd dropdown is worse than four rows.
export function customStepCount(value: string | number | null): number {
  const text = typeof value === "number" ? String(value) : (value ?? "").trim();
  if (!/^\d+$/.test(text)) return DEFAULT_CUSTOM_STEPS;
  return Math.min(Math.max(Number(text), 1), MAX_CUSTOM_STEPS);
}

export type PersonOption = { id: string; name: string };

export type ActivityOption = { id: string; name: string };

export type StepDefault = {
  activityId: string;
  activityName: string;
  assigneeId: string | null;
  expectedDays: number;
};

// A switch sends its value only when on, so "on" vs missing is the answer. Only the two dropdowns can fail.
export function parseNewTrailPage(values: {
  unit: string | null;
  set: string | null;
  steps: string | null;
  pickPeople: string | null;
  start: string | null;
}):
  | {
      ok: true;
      unitId: string;
      setId: string | null;
      custom: boolean;
      steps: number;
      pickPeople: boolean;
      start: boolean;
    }
  | { ok: false; error: string } {
  const unitId = (values.unit ?? "").trim();
  if (!unitId) return { ok: false, error: "Pick a house first." };

  const set = (values.set ?? "").trim();
  if (!set) return { ok: false, error: "Pick a trail type first." };

  const custom = set === CUSTOM_SET;
  return {
    ok: true,
    unitId,
    setId: custom ? null : set,
    custom,
    steps: customStepCount(values.steps),
    pickPeople: values.pickPeople !== null,
    start: values.start !== null,
  };
}

function isBlankValue(value: string | null): boolean {
  return value === null || value.trim() === "";
}

function wholeDays(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 ? n : null;
}

// Same checks and words as the app's openTrail (lib/relay/actions.ts). Set-mode rows take their
// activity from `activityIds`; a shrunk or deleted type leaves a row with no id, refused at once
// as "no longer exists". Custom mode drops wholly blank rows before numbering, so an error never
// names an empty "Step 6".
export function parseTrailSteps(
  values: Record<string, string | null>,
  opts: { mode: "set" | "custom"; count: number; activityIds?: string[] },
):
  | {
      ok: true;
      title: string | null;
      legs: { activityId: string; assigneeId: string; expectedDays: number }[];
    }
  | { ok: false; error: string } {
  const { mode, count, activityIds } = opts;

  type Draft = { activityId: string | null; assigneeId: string | null; days: string | null };
  const kept: Draft[] = [];

  for (let i = 1; i <= count; i++) {
    const activityRaw = values[`activity_${i}`] ?? null;
    const personRaw = values[`person_${i}`] ?? null;
    const daysRaw = values[`days_${i}`] ?? null;

    if (mode === "set") {
      const activityId = activityIds?.[i - 1];
      if (activityId === undefined) {
        return { ok: false, error: "That trail type no longer exists." };
      }
      kept.push({ activityId, assigneeId: personRaw, days: daysRaw });
    } else {
      if (isBlankValue(activityRaw) && isBlankValue(personRaw) && isBlankValue(daysRaw)) continue;
      kept.push({ activityId: activityRaw, assigneeId: personRaw, days: daysRaw });
    }
  }

  if (kept.length === 0) {
    return { ok: false, error: "A trail needs at least one activity." };
  }

  const legs: { activityId: string; assigneeId: string; expectedDays: number }[] = [];
  for (let index = 0; index < kept.length; index++) {
    const stepNo = index + 1;
    const draft = kept[index];

    if (isBlankValue(draft.activityId)) {
      return { ok: false, error: `Step ${stepNo} needs an activity.` };
    }
    if (isBlankValue(draft.assigneeId)) {
      return { ok: false, error: `Step ${stepNo} needs someone to carry it.` };
    }
    const expectedDays = wholeDays(draft.days);
    if (expectedDays === null) {
      return { ok: false, error: `Step ${stepNo} needs a whole number of days, at least 1.` };
    }

    legs.push({
      activityId: draft.activityId as string,
      assigneeId: draft.assigneeId as string,
      expectedDays,
    });
  }

  const seen = new Set<string>();
  for (const leg of legs) {
    if (seen.has(leg.activityId)) {
      return {
        ok: false,
        error: "The same activity appears twice — each step should be a different one.",
      };
    }
    seen.add(leg.activityId);
  }

  const title = (values.title ?? "").trim() || null;

  return { ok: true, title, legs };
}
