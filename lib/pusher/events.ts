/**
 * The relay's vocabulary, and the mirror of the database guard.
 *
 * These rules exist in two places on purpose. The trigger in migration
 * 0036 §8 is THE BOUNDARY — it is what actually holds, against a raw
 * PostgREST POST as much as against a button. What lives here decides
 * only which buttons render, so that someone is not offered an action
 * the database is going to refuse.
 *
 * If the two ever disagree the database wins, loudly: the guard's message
 * is written to be read by a person and `guardError()` in actions.ts
 * passes it through intact rather than swallowing it.
 *
 * Everything here answers from the chain's LAST EVENT plus the number of
 * legs plus who is asking — the same three inputs the guard uses, and
 * deliberately not a replay. Pure: no I/O, no clock.
 */

export type EventKind = "started" | "pushed" | "bounced" | "completed" | "handed";

export type BounceReason = "rework" | "missing_info" | "wrong_person" | "client_change" | "other";

/** Order matters — this is the order the chips render in. */
export const BOUNCE_REASONS: readonly { value: BounceReason; label: string }[] = [
  { value: "rework", label: "Needs rework" },
  { value: "missing_info", label: "Missing information" },
  { value: "wrong_person", label: "Wrong person" },
  { value: "client_change", label: "Client changed something" },
  { value: "other", label: "Something else" },
];

export function bounceReasonLabel(reason: string | null): string {
  return BOUNCE_REASONS.find((r) => r.value === reason)?.label ?? "Other";
}

/**
 * One row of pusher_chain_events. `to_assignee_id` and `to_expected_days`
 * are SNAPSHOTS stamped by the guard when the baton landed — never read
 * the leg row to answer a question about the past.
 */
export type ChainEvent = {
  seq: number;
  kind: EventKind;
  from_leg: number | null;
  to_leg: number | null;
  actor_id: string;
  to_assignee_id: string | null;
  to_expected_days: number | null;
  reason: string | null;
  note: string | null;
  occurred_at: string;
};

export type Leg = {
  leg_no: number;
  label: string;
  assignee_id: string;
  expected_days: number;
};

/** Who is asking, and whether the rules bend for them. */
export type Actor = { userId: string; isAdmin: boolean };

export function lastEvent(events: readonly ChainEvent[]): ChainEvent | null {
  if (events.length === 0) return null;
  // Callers order by seq, but a caller that forgot would otherwise get a
  // silently wrong answer to every question below.
  return events.reduce((a, b) => (b.seq > a.seq ? b : a));
}

export function isComplete(last: ChainEvent | null): boolean {
  return last?.kind === "completed";
}

/** The leg the baton is standing on, or null if the trail is over or unopened. */
export function currentLeg(last: ChainEvent | null): number | null {
  if (!last || isComplete(last)) return null;
  return last.to_leg;
}

export function holderOf(last: ChainEvent | null): string | null {
  if (!last || isComplete(last)) return null;
  return last.to_assignee_id;
}

/** Admins can move any baton — the escape hatch when someone is away. */
function mayMove(last: ChainEvent | null, actor: Actor): boolean {
  if (!last || isComplete(last)) return false;
  return actor.isAdmin || last.to_assignee_id === actor.userId;
}

export function canPush(last: ChainEvent | null, legCount: number, actor: Actor): boolean {
  const leg = currentLeg(last);
  return mayMove(last, actor) && leg !== null && leg < legCount;
}

export function canFinish(last: ChainEvent | null, legCount: number, actor: Actor): boolean {
  const leg = currentLeg(last);
  return mayMove(last, actor) && leg !== null && leg === legCount;
}

export function canBounce(last: ChainEvent | null, actor: Actor): boolean {
  const leg = currentLeg(last);
  return mayMove(last, actor) && leg !== null && leg > 1;
}

/** Legs a bounce may target: everything behind the baton. */
export function bounceTargets(last: ChainEvent | null): number[] {
  const leg = currentLeg(last);
  if (leg === null || leg <= 1) return [];
  return Array.from({ length: leg - 1 }, (_, i) => i + 1);
}

/** Only an admin hands a baton over, and only while the trail is live. */
export function canHand(last: ChainEvent | null, actor: Actor): boolean {
  return actor.isAdmin && !!last && !isComplete(last);
}

/**
 * Legs still editable: everything ahead of the baton. The current leg is
 * excluded on purpose — holder and expected days come from the event
 * snapshot, so editing it would change nothing anyone can see, and the
 * guard refuses it rather than doing nothing silently.
 */
export function editableFromLeg(last: ChainEvent | null): number | null {
  const leg = currentLeg(last);
  return leg === null ? null : leg + 1;
}
