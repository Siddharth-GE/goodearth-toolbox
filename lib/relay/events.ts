/**
 * The relay's vocabulary and a mirror of the database guard (0036 §8), which is THE BOUNDARY.
 * This only decides which buttons render; if they disagree the database wins and guardError() passes its message through.
 * Answers from the last event, the leg count and who is asking, the guard's inputs. Pure.
 */

export type EventKind =
  "started" | "pushed" | "bounced" | "completed" | "handed" | "client_held" | "client_returned";

/** Kinds that say where the work stands. A hand-off is not one: reassigning must not take work back from a client. Same list decides flow in the view (0064). */
const FLOW_KINDS: readonly EventKind[] = [
  "started",
  "pushed",
  "bounced",
  "client_held",
  "client_returned",
];

export type BounceReason = "rework" | "missing_info" | "wrong_person" | "client_change" | "other";

/** Order matters: chips render in this order. */
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

/** One pusher_chain_events row. to_assignee_id and to_expected_days are guard snapshots; never read the leg row for the past. */
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

/** A leg IS an activity (0043). label is the name snapshotted at write time so a rename can't rewrite history. */
export type Leg = {
  leg_no: number;
  activity_id: string;
  label: string | null;
  assignee_id: string;
  expected_days: number;
};

export type Actor = { userId: string; isAdmin: boolean };

export function lastEvent(events: readonly ChainEvent[]): ChainEvent | null {
  if (events.length === 0) return null;
  // Callers order by seq; sort anyway so a forgetful one isn't silently wrong.
  return events.reduce((a, b) => (b.seq > a.seq ? b : a));
}

export function isComplete(last: ChainEvent | null): boolean {
  return last?.kind === "completed";
}

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

export function bounceTargets(last: ChainEvent | null): number[] {
  const leg = currentLeg(last);
  if (leg === null || leg <= 1) return [];
  return Array.from({ length: leg - 1 }, (_, i) => i + 1);
}

export function canHand(last: ChainEvent | null, actor: Actor): boolean {
  return actor.isAdmin && !!last && !isComplete(last);
}

/** Is the work with the client? Read from the last event that MOVED the work (a hand-off can sit on top of a hold); push, bounce and finish clear it. Mirrors the view's flow lateral. */
export function isWithClient(events: readonly ChainEvent[]): boolean {
  const flow = events
    .filter((e) => FLOW_KINDS.includes(e.kind))
    .reduce<ChainEvent | null>((a, b) => (a === null || b.seq > a.seq ? b : a), null);
  return flow?.kind === "client_held" && !isComplete(lastEvent(events));
}

export function canClientHold(last: ChainEvent | null, actor: Actor, withClient: boolean): boolean {
  return mayMove(last, actor) && currentLeg(last) !== null && !withClient;
}

export function canClientReturn(
  last: ChainEvent | null,
  actor: Actor,
  withClient: boolean,
): boolean {
  return mayMove(last, actor) && currentLeg(last) !== null && withClient;
}

/** Legs still editable: everything ahead of the baton. NOT WIRED TO A SCREEN YET, NOT DEAD CODE: the read half of the queued-trail editor (write half: replaceFutureLegs). */
export function editableFromLeg(last: ChainEvent | null): number | null {
  const leg = currentLeg(last);
  return leg === null ? null : leg + 1;
}
