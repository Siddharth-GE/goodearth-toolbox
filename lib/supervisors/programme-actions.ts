"use server";

// Type-only import, never re-exported from a "use server" file (check:actions enforces it).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { todayInIndia } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isStageStatus, isWaitingOn, type StageStatus, type WaitingOn } from "./programme";
import { getVillaForecast, getVillaRules } from "./programme-queries";
import { firstPlanBlocker, followsInCircle, isSequenceLink } from "./schedule";

/** Writes to Supervisors' own stage tables (0137). A stage row is made the first time anything is set on it; the database keeps the
 * dates in line with the status and writes the history. Every action revalidates the layout (the exact-path trap in CLAUDE.md). */

const GRANT = "/supervisors";
const NOTE_LIMIT = 500;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A stage as it stood, so Undo can put it back exactly. */
export type StageSnapshot = {
  status: StageStatus;
  waitingOn: WaitingOn | null;
  waitingNote: string | null;
  startedOn: string | null;
  finishedOn: string | null;
  /** When it entered its status; Undo sends it back, and the database takes it only if its history agrees (0138). */
  statusChangedAt: string | null;
};

function refresh(plotId: string) {
  revalidatePath("/supervisors", "layout");
  revalidatePath(`/supervisors/villas/${plotId}`);
}

async function writeStage(
  plotId: string,
  groupId: string,
  fields: Record<string, string | number | boolean | null>,
  what: string,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!plotId || !groupId) return { error: "Which stage?" };
  const supabase = await createClient();
  // Update first, so the row keeps who made it; insert only when the stage has no row yet.
  const updated = await supabase
    .from("site_stages")
    .update({ ...fields, updated_by: user.id })
    .eq("plot_id", plotId)
    .eq("work_group_id", groupId)
    .select("id");
  let error = updated.error;
  if (!error && (updated.data ?? []).length === 0) {
    ({ error } = await supabase.from("site_stages").insert({
      plot_id: plotId,
      work_group_id: groupId,
      ...fields,
      created_by: user.id,
      updated_by: user.id,
    }));
  }
  if (error) {
    console.error(`${what} failed:`, error);
    if (error.code === "23514" && error.message.includes("not_needed")) {
      return { error: "This stage has begun, so it is needed — set it back to Not started first." };
    }
    if (error.code === "23514" && error.message.includes("follows")) {
      return { error: "Pick the stage it follows, and after or alongside — never itself." };
    }
    if (error.code === "23514") {
      return {
        error:
          "Those dates don't fit the stage — a started stage needs its start, a done one its finish too.",
      };
    }
    if (error.code === "P0001") return { error: error.message };
    return { error: "Could not save the stage. Try again." };
  }
  refresh(plotId);
  return undefined;
}

/**
 * Working, waiting, done or back to not started. Working keeps the start it has or starts today; done
 * finishes today (and starts today too if nothing was logged); waiting says on what.
 */
export async function setStageStatus(input: {
  plotId: string;
  groupId: string;
  status: string;
  current: StageSnapshot;
  waitingOn?: string;
  waitingNote?: string;
}): Promise<ActionState> {
  await requireTool(GRANT);
  if (!isStageStatus(input.status)) return { error: "Pick working, waiting or done." };
  const today = todayInIndia();
  const note = (input.waitingNote ?? "").trim();
  if (note.length > NOTE_LIMIT) return { error: `Keep the note under ${NOTE_LIMIT} characters.` };

  const { current } = input;
  const starting = input.status === "working" || input.status === "done";
  const stored =
    starting && !current.startedOn ? await readStage(input.plotId, input.groupId) : null;
  if (stored && "error" in stored) return stored;
  const pinned = stored?.pinnedStart ?? null;
  // A planned start that has passed is the day it began, not today.
  const begun = current.startedOn ?? (pinned && pinned <= today ? pinned : today);
  switch (input.status) {
    case "working":
      return writeStage(
        input.plotId,
        input.groupId,
        {
          status: "working",
          started_on: begun,
          finished_on: null,
          waiting_on: null,
          waiting_note: null,
        },
        "setStageStatus working",
      );
    case "waiting": {
      const on = input.waitingOn ?? "";
      if (!isWaitingOn(on)) return { error: "Say what the stage is waiting on." };
      return writeStage(
        input.plotId,
        input.groupId,
        {
          status: "waiting",
          started_on: current.startedOn,
          finished_on: null,
          waiting_on: on,
          waiting_note: note || null,
        },
        "setStageStatus waiting",
      );
    }
    case "done": {
      const started = begun;
      return writeStage(
        input.plotId,
        input.groupId,
        {
          status: "done",
          started_on: started,
          finished_on: started > today ? started : today,
          waiting_on: null,
          waiting_note: null,
        },
        "setStageStatus done",
      );
    }
    case "not_started":
      return writeStage(
        input.plotId,
        input.groupId,
        {
          status: "not_started",
          started_on: null,
          finished_on: null,
          waiting_on: null,
          waiting_note: null,
        },
        "setStageStatus not started",
      );
  }
}

/** The stage as the database holds it (a stage with no row is not started), or an error to show. */
async function readStage(
  plotId: string,
  groupId: string,
): Promise<
  { status: string; startedOn: string | null; pinnedStart: string | null } | { error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_stages")
    .select("status, started_on, pinned_start")
    .eq("plot_id", plotId)
    .eq("work_group_id", groupId)
    .maybeSingle();
  if (error) {
    console.error("readStage failed:", error);
    return { error: "Could not read the stage. Try again." };
  }
  return {
    status: data?.status ?? "not_started",
    startedOn: data?.started_on ?? null,
    pinnedStart: data?.pinned_start ?? null,
  };
}

/** Undo: the stage exactly as it was before the last tap. */
export async function restoreStage(input: {
  plotId: string;
  groupId: string;
  snapshot: StageSnapshot;
}): Promise<ActionState> {
  const { snapshot } = input;
  if (!isStageStatus(snapshot.status)) return { error: "Could not undo that." };
  if (snapshot.waitingOn !== null && !isWaitingOn(snapshot.waitingOn))
    return { error: "Could not undo that." };
  return writeStage(
    input.plotId,
    input.groupId,
    {
      status: snapshot.status,
      waiting_on: snapshot.waitingOn,
      waiting_note: snapshot.waitingNote,
      started_on: snapshot.startedOn,
      finished_on: snapshot.finishedOn,
      ...(snapshot.statusChangedAt ? { status_changed_at: snapshot.statusChangedAt } : {}),
    },
    "restoreStage",
  );
}

/** Corrects a stage's real dates. A not-started stage has none; a done one needs both. */
export async function setStageDates(input: {
  plotId: string;
  groupId: string;
  startedOn: string;
  finishedOn: string;
}): Promise<ActionState> {
  const startedOn = input.startedOn.trim();
  const finishedOn = input.finishedOn.trim();
  if ((startedOn && !DATE.test(startedOn)) || (finishedOn && !DATE.test(finishedOn))) {
    return { error: "Pick the dates from the calendar." };
  }
  if (finishedOn && startedOn && finishedOn < startedOn) {
    return { error: "The finish can't be before the start." };
  }
  return writeStage(
    input.plotId,
    input.groupId,
    { started_on: startedOn || null, finished_on: finishedOn || null },
    "setStageDates",
  );
}

/** The contractor on a stage; empty takes them off. The database refuses a vendor not marked as a contractor. */
export async function setStageContractor(input: {
  plotId: string;
  groupId: string;
  contractorId: string;
}): Promise<ActionState> {
  return writeStage(
    input.plotId,
    input.groupId,
    { contractor_id: input.contractorId || null },
    "setStageContractor",
  );
}

/**
 * This villa's own days for a stage and when it starts; empty goes back to the learned or typical days, and the chain. A start
 * that has already passed on a stage not yet begun means it began that day: the stage turns working from then.
 */
export async function setStagePlan(input: {
  plotId: string;
  groupId: string;
  days: string;
  pinnedStart: string;
}): Promise<ActionState> {
  await requireTool(GRANT);
  const daysText = input.days.trim();
  const days = daysText ? Number(daysText) : null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 999)) {
    return { error: "Days is a whole number, 1 or more." };
  }
  const startOn = input.pinnedStart.trim();
  if (startOn && !DATE.test(startOn)) return { error: "Pick the date from the calendar." };
  const stored =
    startOn && startOn <= todayInIndia() ? await readStage(input.plotId, input.groupId) : null;
  if (stored && "error" in stored) return stored;
  // The date is kept as well, so "Not started" by mistake can be undone to it.
  if (
    stored &&
    !stored.startedOn &&
    (stored.status === "not_started" || stored.status === "waiting")
  ) {
    return writeStage(
      input.plotId,
      input.groupId,
      stored.status === "waiting"
        ? { days, pinned_start: startOn, started_on: startOn }
        : {
            days,
            pinned_start: startOn,
            status: "working",
            started_on: startOn,
            finished_on: null,
            waiting_on: null,
            waiting_note: null,
          },
      "setStagePlan started",
    );
  }
  return writeStage(
    input.plotId,
    input.groupId,
    { days, pinned_start: startOn || null },
    "setStagePlan",
  );
}

async function writeVilla(
  plotId: string,
  fields: Record<string, string | null>,
  what: string,
  failure: string,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!plotId) return { error: "Which villa?" };
  const supabase = await createClient();
  const updated = await supabase
    .from("site_villas")
    .update({ ...fields, updated_by: user.id })
    .eq("plot_id", plotId)
    .select("id");
  let error = updated.error;
  if (!error && (updated.data ?? []).length === 0) {
    ({ error } = await supabase.from("site_villas").insert({
      plot_id: plotId,
      ...fields,
      created_by: user.id,
      updated_by: user.id,
    }));
  }
  if (error) {
    console.error(`${what} failed:`, error);
    return { error: failure };
  }
  refresh(plotId);
  return undefined;
}

/** Who runs the villa — the board's Mine / Everyone. A filter, not a permission. */
/** Who owns this stage on this villa (0158); empty goes back to the stage's category lead. */
export async function setStageOwner(input: {
  plotId: string;
  groupId: string;
  ownerId: string;
}): Promise<ActionState> {
  return writeStage(
    input.plotId,
    input.groupId,
    { owner_id: input.ownerId || null },
    "setStageOwner",
  );
}

/** A work category's lead (0158): owns that category's stages on every villa that names no owner of its own. Empty
 * takes the lead off. */
export async function setCategoryLead(input: {
  categoryId: string;
  ownerId: string;
}): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!input.categoryId) return { error: "Which work category?" };
  const supabase = await createClient();
  const { error } = input.ownerId
    ? await supabase.from("site_category_owners").upsert(
        {
          category_id: input.categoryId,
          owner_id: input.ownerId,
          created_by: user.id,
          updated_by: user.id,
        },
        { onConflict: "category_id" },
      )
    : await supabase.from("site_category_owners").delete().eq("category_id", input.categoryId);
  if (error) {
    console.error("setCategoryLead failed:", error);
    return { error: "Could not save the lead. Try again." };
  }
  revalidatePath("/supervisors", "layout");
  return undefined;
}

export async function setVillaSupervisor(input: {
  plotId: string;
  supervisorId: string;
}): Promise<ActionState> {
  return writeVilla(
    input.plotId,
    { supervisor_id: input.supervisorId || null },
    "setVillaSupervisor",
    "Could not save who runs this villa. Try again.",
  );
}

/** The one typed date of the schedule: the day the villa's first stage starts. */
export async function setVillaStart(input: {
  plotId: string;
  startOn: string;
}): Promise<ActionState> {
  await requireTool(GRANT);
  const startOn = input.startOn.trim();
  if (startOn && !DATE.test(startOn)) return { error: "Pick the date from the calendar." };
  return writeVilla(
    input.plotId,
    { start_on: startOn || null },
    "setVillaStart",
    "Could not save the start date. Try again.",
  );
}

/**
 * Copies today's forecast, worked out here and never sent from the phone, into each stage's first plan. Setting it again needs a
 * note, which the history keeps. The stages first, then the villa's stamp: a failure between leaves no first plan showing.
 */
export async function setFirstPlan(input: { plotId: string; note: string }): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!input.plotId) return { error: "Which villa?" };
  const note = input.note.trim();
  if (note.length > NOTE_LIMIT) return { error: `Keep the note under ${NOTE_LIMIT} characters.` };
  let forecast: Awaited<ReturnType<typeof getVillaForecast>>;
  try {
    forecast = await getVillaForecast(input.plotId);
  } catch (thrown) {
    console.error("setFirstPlan read failed:", thrown);
    return { error: "Could not work out the plan. Try again." };
  }
  const { startOn, baselinedAt, schedule } = forecast;
  if (baselinedAt && !note) return { error: "Say why the first plan is being set again." };
  const blocker = firstPlanBlocker(schedule, startOn);
  if (blocker) return { error: blocker };

  const supabase = await createClient();
  const missing = await supabase.from("site_stages").upsert(
    schedule.stages.map((stage) => ({
      plot_id: input.plotId,
      work_group_id: stage.groupId,
      created_by: user.id,
      updated_by: user.id,
    })),
    { onConflict: "plot_id,work_group_id", ignoreDuplicates: true },
  );
  const planned =
    missing.error ??
    (
      await supabase.from("site_stages").upsert(
        schedule.stages.map((stage) => ({
          plot_id: input.plotId,
          work_group_id: stage.groupId,
          baseline_start: stage.start,
          baseline_finish: stage.finish,
          updated_by: user.id,
        })),
        { onConflict: "plot_id,work_group_id" },
      )
    ).error;
  if (planned) {
    console.error("setFirstPlan stages failed:", planned);
    return { error: "Could not set the first plan. Try again." };
  }
  return writeVilla(
    input.plotId,
    { baselined_at: new Date().toISOString(), baseline_note: note || null },
    "setFirstPlan",
    "Could not set the first plan. Try again.",
  );
}

/** Leaves a stage off this villa, or brings it back. Only a stage not begun can be left off; the database says so too. */
export async function setStageNeeded(input: {
  plotId: string;
  groupId: string;
  needed: boolean;
}): Promise<ActionState> {
  await requireTool(GRANT);
  if (!input.needed) {
    const stored = await readStage(input.plotId, input.groupId);
    if ("error" in stored) return stored;
    if (stored.status !== "not_started") {
      return { error: "This stage has begun, so it is needed — set it back to Not started first." };
    }
  }
  return writeStage(input.plotId, input.groupId, { not_needed: !input.needed }, "setStageNeeded");
}

/** What a stage follows on this villa only; empty goes back to the sequence. Refused when it would wait on itself. */
export async function setStageFollows(input: {
  plotId: string;
  groupId: string;
  followsGroupId: string;
  link: string;
}): Promise<ActionState> {
  await requireTool(GRANT);
  if (!input.followsGroupId) {
    return writeStage(
      input.plotId,
      input.groupId,
      { follows_group_id: null, link: null },
      "setStageFollows reset",
    );
  }
  if (!isSequenceLink(input.link)) return { error: "Pick after or alongside." };
  if (input.followsGroupId === input.groupId) return { error: "A stage can't follow itself." };
  let rules: Awaited<ReturnType<typeof getVillaRules>>;
  try {
    rules = await getVillaRules(input.plotId);
  } catch (thrown) {
    console.error("setStageFollows read failed:", thrown);
    return { error: "Could not read the villa's order. Try again." };
  }
  if (followsInCircle(rules, input.groupId, input.followsGroupId)) {
    return { error: "That stage already waits on this one — pick another." };
  }
  return writeStage(
    input.plotId,
    input.groupId,
    { follows_group_id: input.followsGroupId, link: input.link },
    "setStageFollows",
  );
}
