/**
 * The Saarang tracker's rules, pure — which section an action sits in,
 * what its date says, how healthy a plot is, how far along its rail.
 *
 * Ported from the tracker the CRM team already uses (root plan.md,
 * seventh piece), so the toolbox answers the way they are used to:
 *
 *   * NO DATE IS OVERDUE. An action without a due date sits with the
 *     overdue ones until someone gives it a real date — the tracker's way
 *     of making every promise to a client carry one.
 *   * "Waiting on management" outranks everything: it is the flag a team
 *     member raises when only a manager can clear it.
 *   * A plot with a buyer and nothing open has "no next step" — unless it
 *     is handed over, when nothing open is the point.
 *
 * Dates are ISO strings compared as strings, `today` passed in (Client
 * Relations' rule 7): nothing here reads a clock.
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

export type ActionBucket = "confirm" | "management" | "overdue" | "week" | "later" | "done";

/** The sections of an open list, top to bottom. Done sits apart. */
export const OPEN_BUCKETS = ["confirm", "management", "overdue", "week", "later"] as const;

export type BucketInput = { status: string; dueOn: string | null };

/**
 * "Finished, waiting to confirm" sits on its own: the owner's work is done
 * and only the setter's tick closes it (founder, 2026-10-16: "you can only
 * complete an action that you set"), so it is never overdue.
 */
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

/** Open by date, then by plot; no date last, as the tracker lists them. */
export function compareOpen(
  a: { dueOn: string | null; plotSort?: string },
  b: { dueOn: string | null; plotSort?: string },
): number {
  const ad = a.dueOn ?? "9";
  const bd = b.dueOn ?? "9";
  if (ad !== bd) return ad < bd ? -1 : 1;
  return (a.plotSort ?? "").localeCompare(b.plotSort ?? "", "en", { numeric: true });
}

/** Done, most recent first. */
export function compareDone(a: { doneOn: string | null }, b: { doneOn: string | null }): number {
  return (b.doneOn ?? "").localeCompare(a.doneOn ?? "");
}

/**
 * The open action a plot should do next: the earliest date, no date last.
 * A finished one waiting to be confirmed comes only when nothing else is open.
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
 * not everyone can". Whoever set it closes it, and so does a manager; its
 * owner, having done the work, marks it finished for the setter to
 * confirm; anyone else only looks. An action brought in from the old
 * tracker records no setter, so its owner counts as one.
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
  /** Overdue only because the old sheet had no date. */
  assumed: number;
};

export function loadOf(actions: readonly DueInput[], today: string): Load {
  const load: Load = { open: 0, overdue: 0, week: 0, later: 0, management: 0, assumed: 0 };
  for (const action of actions) {
    const bucket = actionBucket(action, today);
    // Finished and waiting to be confirmed is the setter's to close, not the owner's load.
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

// ---------------------------------------------------------------------
// A plot — its status, health and rail
// ---------------------------------------------------------------------

export type PlotStatus =
  "available" | "reserved" | "booked" | "deed_signed" | "ca_signed" | "handed_over";

export const PLOT_STATUS_LABELS: Record<PlotStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  booked: "Booked",
  deed_signed: "Sale deed signed",
  ca_signed: "CA signed",
  handed_over: "Handed over",
};

export type PlotInput = {
  hasBuyer: boolean;
  unitStatus: string;
  saleDeedStatus: string;
  caStatus: string;
  /** Position of the plot's build stage in the Masters list; -1 for none. */
  stageIndex: number;
  /** Position of the last active stage — "handed over"; -1 if the list is empty. */
  finalIndex: number;
};

export function isHandedOver(plot: Pick<PlotInput, "stageIndex" | "finalIndex">): boolean {
  return plot.finalIndex >= 0 && plot.stageIndex >= plot.finalIndex;
}

/** The furthest thing that is true of a plot, the tracker's ladder. */
export function plotStatus(plot: PlotInput): PlotStatus {
  if (!plot.hasBuyer) return plot.unitStatus === "reserved" ? "reserved" : "available";
  if (isHandedOver(plot)) return "handed_over";
  if (plot.caStatus === "signed") return "ca_signed";
  if (plot.saleDeedStatus === "signed") return "deed_signed";
  return "booked";
}

export type Health =
  "overdue" | "management" | "no_next_step" | "stale" | "on_track" | "handed_over";

export const HEALTH: Record<Health, { label: string; tone: "danger" | "warning" | "success" }> = {
  overdue: { label: "Overdue", tone: "danger" },
  management: { label: "Needs management", tone: "danger" },
  no_next_step: { label: "No next step", tone: "warning" },
  stale: { label: "Not updated in 2 weeks", tone: "warning" },
  on_track: { label: "On track", tone: "success" },
  handed_over: { label: "Handed over", tone: "success" },
};

/** The health chips on the plots grid, in the order they filter. */
export const HEALTH_FILTERS: Health[] = ["overdue", "management", "no_next_step", "stale"];

/**
 * How a plot is doing — null for a plot with no buyer, which has nothing
 * to be late on. `lastTouched` is the latest change to the plot or any of
 * its actions; past two weeks it reads "not updated".
 */
export function plotHealth(
  plot: PlotInput & { lastTouched: string | null },
  actions: readonly BucketInput[],
  today: string,
): Health | null {
  if (!plot.hasBuyer) return null;
  const open = actions.filter((a) => a.status !== "done");
  if (open.some((a) => actionBucket(a, today) === "overdue")) return "overdue";
  if (open.some((a) => a.status === "waiting_management")) return "management";
  if (open.length === 0) return isHandedOver(plot) ? "handed_over" : "no_next_step";
  if (plot.lastTouched && daysBetween(plot.lastTouched, today) > 14) return "stale";
  return "on_track";
}

export type Rail = {
  /** buyer → sale deed → CA → build → handed over */
  steps: [boolean, boolean, boolean, boolean, boolean];
  /** How far through the build, 0–1, for the fourth step's fill. */
  build: number;
};

/**
 * The five-step rail. The Masters list's FIRST stage is the paperwork
 * before ground is broken (Agreement), so the build step starts filling
 * from the second; its LAST active stage is the handover.
 */
export function plotRail(plot: PlotInput): Rail {
  const started = plot.stageIndex >= 1;
  const handedOver = isHandedOver(plot);
  const build = plot.finalIndex > 0 && started ? Math.min(1, plot.stageIndex / plot.finalIndex) : 0;
  return {
    steps: [
      plot.hasBuyer,
      plot.saleDeedStatus === "signed",
      plot.caStatus === "signed",
      started,
      handedOver,
    ],
    build,
  };
}

/**
 * The number a plot goes by, the way the tracker printed it: Masters'
 * code without its "P" ("P22-23" → "22-23"), else the name without
 * "Plot" or "Villa". Set in monospace, it reads like a surveyed lot.
 */
export function plotNumber(code: string | null, name: string): string {
  const fromCode = code?.trim();
  if (fromCode) return /^P\d/i.test(fromCode) ? fromCode.slice(1) : fromCode;
  const fromName = name.replace(/^(plot|villa|unit)\s*/i, "").trim();
  return fromName || name;
}
