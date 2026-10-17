/**
 * The rules every action list in the toolbox shares — which section an
 * action sits in, what its date says, who may close it, how loaded a
 * person is. Born in Client Relations (the Saarang tracker, root plan.md
 * seventh and eighth pieces) and moved here when Design Management's
 * board took the same list (twelfth piece): two tools wanting the same
 * rules get a shared module, never an import of each other's code.
 *
 *   * NO DATE IS OVERDUE. An action without a due date sits with the
 *     overdue ones until someone gives it a real date.
 *   * "Waiting on management" outranks everything: the flag a person
 *     raises when only a manager can clear it.
 *   * "Finished, waiting to confirm" is the setter's to close, never
 *     overdue and never its owner's load.
 *
 * Dates are ISO strings compared as strings, `today` passed in: nothing
 * here reads a clock (todayInIndia() in lib/format.ts is the one read).
 */
import { formatDayDate, formatShortDate } from "@/lib/format";

// ---------------------------------------------------------------------
// Calendar arithmetic on "YYYY-MM-DD"
// ---------------------------------------------------------------------

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** `iso` moved by `days`, still "YYYY-MM-DD". */
export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` — negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return new Date(utc(iso)).getUTCDay();
}

// ---------------------------------------------------------------------
// An action's section and its date
// ---------------------------------------------------------------------

/** An action's statuses, in the order its ••• menu lists them. */
export const ACTION_STATUSES = [
  { value: "open", label: "Open" },
  { value: "waiting_client", label: "Waiting on client" },
  { value: "waiting_management", label: "Waiting on management" },
  // Finished by its owner; only its setter or a manager closes it.
  { value: "awaiting_confirmation", label: "Finished — waiting to confirm" },
  { value: "done", label: "Done" },
] as const;

export type ActionStatus = (typeof ACTION_STATUSES)[number]["value"];

export function isActionStatus(value: string): value is ActionStatus {
  return ACTION_STATUSES.some((status) => status.value === value);
}

export type ActionBucket = "confirm" | "management" | "overdue" | "week" | "later" | "done";

/** The sections of a list, top to bottom. */
export const BUCKET_ORDER: readonly ActionBucket[] = [
  "confirm",
  "management",
  "overdue",
  "week",
  "later",
  "done",
];

export type BucketInput = { status: string; dueOn: string | null };

export function actionBucket(action: BucketInput, today: string): ActionBucket {
  if (action.status === "done") return "done";
  if (action.status === "awaiting_confirmation") return "confirm";
  if (action.status === "waiting_management") return "management";
  if (!action.dueOn || action.dueOn < today) return "overdue";
  if (action.dueOn <= addDays(today, 7)) return "week";
  return "later";
}

export type DueTone = "danger" | "info" | "neutral" | "success";

export type DueLabel = { text: string; tone: DueTone };

export type DueInput = BucketInput & { dueAssumed?: boolean; doneOn?: string | null };

/**
 * What an action's date chip says. Words carry the urgency, never colour
 * alone: "3 days overdue", "Tomorrow", "Fri, 17 Oct".
 */
export function dueLabel(action: DueInput, today: string): DueLabel {
  if (action.status === "done") {
    return {
      text: action.doneOn ? `Done ${formatShortDate(action.doneOn)}` : "Done",
      tone: "success",
    };
  }
  if (action.status === "awaiting_confirmation")
    return { text: "Finished · to confirm", tone: "success" };
  if (!action.dueOn) return { text: "No date · overdue", tone: "danger" };
  const days = daysBetween(today, action.dueOn);
  if (days < 0) {
    const late = -days;
    const assumed = action.dueAssumed ? " · date assumed" : "";
    return { text: `${late} day${late === 1 ? "" : "s"} overdue${assumed}`, tone: "danger" };
  }
  if (days === 0) return { text: "Today", tone: "info" };
  if (days === 1) return { text: "Tomorrow", tone: "info" };
  return { text: formatDayDate(action.dueOn), tone: days <= 7 ? "info" : "neutral" };
}

/**
 * The due menu's quick picks. "This Friday" on a Friday is next week's —
 * today already has its own line.
 */
export function dueChoices(today: string): { label: string; date: string }[] {
  const weekday = weekdayOf(today);
  const toMonday = (8 - weekday) % 7 || 7;
  const toFriday = (5 - weekday + 7) % 7 || 7;
  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "This Friday", date: addDays(today, toFriday) },
    { label: "Next Monday", date: addDays(today, toMonday) },
    { label: "In 2 weeks", date: addDays(today, 14) },
  ];
}

/** Open by date, then by the caller's sort key; no date last. */
export function compareOpen(
  a: { dueOn: string | null; sortKey?: string },
  b: { dueOn: string | null; sortKey?: string },
): number {
  const ad = a.dueOn ?? "9";
  const bd = b.dueOn ?? "9";
  if (ad !== bd) return ad < bd ? -1 : 1;
  return (a.sortKey ?? "").localeCompare(b.sortKey ?? "", "en", { numeric: true });
}

/** Done, most recent first. */
export function compareDone(a: { doneOn: string | null }, b: { doneOn: string | null }): number {
  return (b.doneOn ?? "").localeCompare(a.doneOn ?? "");
}

/**
 * The open action to do next: the earliest date, no date last. A finished
 * one waiting to be confirmed comes only when nothing else is open.
 */
export function nextAction<T extends BucketInput>(actions: readonly T[]): T | null {
  const open = actions.filter((a) => a.status !== "done");
  if (open.length === 0) return null;
  const waiting = (a: T) => (a.status === "awaiting_confirmation" ? 1 : 0);
  return [...open].sort((a, b) => waiting(a) - waiting(b) || compareOpen(a, b))[0];
}

// ---------------------------------------------------------------------
// Who may close an action
// ---------------------------------------------------------------------

/**
 * The founder, 2026-10-16: "you can only complete an action that you set,
 * not everyone can". Whoever set it closes it, and so does a manager (an
 * admin); its owner, having done the work, marks it finished for the
 * setter to confirm; anyone else only looks. An action with no setter on
 * record counts its owner as one.
 *
 *   close  — tick it done, or open it again
 *   finish — tick it finished (waiting for the setter), or take that back
 *   none   — the tick is locked
 */
export type CloseRight = "close" | "finish" | "none";

export function setterOf(action: { createdBy: string | null; ownerId: string }): string {
  return action.createdBy ?? action.ownerId;
}

export function closeRight(
  action: { createdBy: string | null; ownerId: string },
  me: { id: string; isManager: boolean },
): CloseRight {
  if (me.isManager || me.id === setterOf(action)) return "close";
  if (me.id === action.ownerId) return "finish";
  return "none";
}

// ---------------------------------------------------------------------
// A person's load — the team strip and the greeting
// ---------------------------------------------------------------------

export type Load = {
  open: number;
  overdue: number;
  week: number;
  later: number;
  management: number;
  /** Overdue only because an old sheet had no date. */
  assumed: number;
};

export function loadOf(actions: readonly DueInput[], today: string): Load {
  const load: Load = { open: 0, overdue: 0, week: 0, later: 0, management: 0, assumed: 0 };
  for (const action of actions) {
    const bucket = actionBucket(action, today);
    if (bucket === "done" || bucket === "confirm") continue;
    load.open += 1;
    load[bucket] += 1;
    if (bucket === "overdue" && action.dueAssumed) load.assumed += 1;
  }
  return load;
}

export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
