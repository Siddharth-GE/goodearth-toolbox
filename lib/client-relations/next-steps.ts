/**
 * The Saarang tracker's own rules, pure: its two sides (Construction and Interior), a plot's status, health and rail. `today` is passed in; nothing reads a clock.
 * The rules every action list shares (buckets, dates, setter and owner, load) live in `lib/next-steps/rules.ts` and are re-exported here.
 * A plot with a buyer and nothing open has "no next step", unless handed over.
 */
import {
  actionBucket,
  compareOpen as compareOpenByKey,
  daysBetween,
  type BucketInput,
} from "@/lib/next-steps/rules";

export {
  actionBucket,
  actionRemoval,
  addDays,
  closeRight,
  compareDone,
  daysBetween,
  dueChoices,
  dueLabel,
  greetingFor,
  loadOf,
  nextAction,
  setterOf,
  weekdayOf,
  type ActionBucket,
  type BucketInput,
  type CloseRight,
  type DueInput,
  type DueLabel,
  type DueTone,
  type Load,
} from "@/lib/next-steps/rules";
export { plotNumber } from "@/lib/masters/plot-number";

/** Open by date, then plot; no date last, as the tracker lists them. The shared sort, with the plot's key under this tool's name. */
export function compareOpen(
  a: { dueOn: string | null; plotSort?: string },
  b: { dueOn: string | null; plotSort?: string },
): number {
  return compareOpenByKey(
    { dueOn: a.dueOn, sortKey: a.plotSort },
    { dueOn: b.dueOn, sortKey: b.plotSort },
  );
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
