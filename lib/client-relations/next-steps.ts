/**
 * The Saarang tracker's rules, pure: an action's section and date, a plot's health and rail. `today` is passed in; nothing reads a clock.
 * NO DATE IS OVERDUE: an undated action sits with the overdue ones until it gets a real date.
 * "Waiting on management" outranks everything. A plot with a buyer and nothing open has "no next step", unless handed over.
 */
import { addDays, daysBetween, weekdayOf } from "@/lib/dates";
import { formatDayDate, formatShortDate } from "@/lib/format";

export { addDays, daysBetween, weekdayOf };

export type ActionBucket = "confirm" | "management" | "overdue" | "week" | "later" | "done";

export type BucketInput = { status: string; dueOn: string | null };

/** "Finished, waiting to confirm" sits on its own: only the setter's tick closes it, so it is never overdue. */
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

/** Words carry the urgency, never colour alone. */
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

/** "This Friday" on a Friday is next week's: today already has its own line. */
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

/** Open by date, then plot; no date last, as the tracker lists them. */
export function compareOpen(
  a: { dueOn: string | null; plotSort?: string },
  b: { dueOn: string | null; plotSort?: string },
): number {
  const ad = a.dueOn ?? "9";
  const bd = b.dueOn ?? "9";
  if (ad !== bd) return ad < bd ? -1 : 1;
  return (a.plotSort ?? "").localeCompare(b.plotSort ?? "", "en", { numeric: true });
}

export function compareDone(a: { doneOn: string | null }, b: { doneOn: string | null }): number {
  return (b.doneOn ?? "").localeCompare(a.doneOn ?? "");
}

/** Who a step on this side of this plot belongs to: the side's owner, nobody else (0125). Null when the side has no owner, which refuses the step. */
export function ownerOfSide(
  plot: { constructionOwnerId: string | null; interiorOwnerId: string | null },
  track: "sales" | "kaadal",
): string | null {
  return track === "kaadal" ? plot.interiorOwnerId : plot.constructionOwnerId;
}

/**
 * Whether a plot belongs on the Plots grid for a side and person. Interior lists only plots with interior work (owner, stage or open action).
 * A person matches a side by owning it or holding an open action on it. `who` is a person id, "mgmt" or "all"/null.
 */
export function plotInList(
  plot: {
    constructionOwner: string | null;
    interiorOwner: string | null;
    interiorStage: string | null;
  },
  open: readonly { track: string; ownerId: string; status: string }[],
  side: "sales" | "kaadal" | null,
  who: string | null,
): boolean {
  const onSide = side ? open.filter((action) => action.track === side) : open;
  if (side === "kaadal" && !plot.interiorOwner && !plot.interiorStage && onSide.length === 0) {
    return false;
  }
  if (!who || who === "all") return true;
  if (who === "mgmt") return onSide.some((action) => action.status === "waiting_management");
  const owns =
    side === "sales"
      ? plot.constructionOwner === who
      : side === "kaadal"
        ? plot.interiorOwner === who
        : plot.constructionOwner === who || plot.interiorOwner === who;
  return owns || onSide.some((action) => action.ownerId === who);
}

/** The earliest open action, no date last; a finished one waiting to confirm only when nothing else is open. */
export function nextAction<T extends BucketInput>(actions: readonly T[]): T | null {
  const open = actions.filter((a) => a.status !== "done");
  if (open.length === 0) return null;
  const waiting = (a: T) => (a.status === "awaiting_confirmation" ? 1 : 0);
  return [...open].sort((a, b) => waiting(a) - waiting(b) || compareOpen(a, b))[0];
}

/**
 * Whoever set an action closes it, and so does a manager; its owner marks it finished for the setter to confirm; anyone else only looks.
 * A tracker action records no setter, so its owner counts as one. close = tick done/reopen; finish = tick finished; none = locked.
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

export type Load = {
  open: number;
  overdue: number;
  week: number;
  later: number;
  management: number;
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
  stageIndex: number;
  /** Position of the last active stage ("handed over"); -1 if the list is empty. */
  finalIndex: number;
};

export function isHandedOver(plot: Pick<PlotInput, "stageIndex" | "finalIndex">): boolean {
  return plot.finalIndex >= 0 && plot.stageIndex >= plot.finalIndex;
}

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

export const HEALTH_FILTERS: Health[] = ["overdue", "management", "no_next_step", "stale"];

/** Null for a plot with no buyer. `lastTouched` is the latest change to the plot or its actions; past two weeks it reads "not updated". */
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
  steps: [boolean, boolean, boolean, boolean, boolean];
  build: number;
};

/** The Masters list's FIRST stage is the paperwork before ground is broken, so the build step fills from the second; the LAST is the handover. */
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

/** Masters' code without its "P" ("P22-23" becomes "22-23"), else the name without "Plot" or "Villa". */
export function plotNumber(code: string | null, name: string): string {
  const fromCode = code?.trim();
  if (fromCode) return /^P\d/i.test(fromCode) ? fromCode.slice(1) : fromCode;
  const fromName = name.replace(/^(plot|villa|unit)\s*/i, "").trim();
  return fromName || name;
}
