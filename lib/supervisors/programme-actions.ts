"use server";

// Type-only import, never re-exported from a "use server" file (check:actions enforces it).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { todayInIndia } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isStageStatus, isWaitingOn, type StageStatus, type WaitingOn } from "./programme";
import { getVillaForecast } from "./programme-queries";
import { firstPlanBlocker } from "./schedule";

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
  fields: Record<string, string | number | null>,
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
  if (!isStageStatus(input.status)) return { error: "Pick working, waiting or done." };
  const today = todayInIndia();
  const note = (input.waitingNote ?? "").trim();
  if (note.length > NOTE_LIMIT) return { error: `Keep the note under ${NOTE_LIMIT} characters.` };

  const { current } = input;
  switch (input.status) {
    case "working":
      return writeStage(
        input.plotId,
        input.groupId,
        {
          status: "working",
          started_on: current.startedOn ?? today,
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
      const started = current.startedOn ?? today;
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

/** This villa's own days for a stage and a start fixed by hand; empty goes back to the learned or typical days, and the chain. */
export async function setStagePlan(input: {
  plotId: string;
  groupId: string;
  days: string;
  pinnedStart: string;
}): Promise<ActionState> {
  const daysText = input.days.trim();
  const days = daysText ? Number(daysText) : null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 999)) {
    return { error: "Days is a whole number, 1 or more." };
  }
  const pinnedStart = input.pinnedStart.trim();
  if (pinnedStart && !DATE.test(pinnedStart)) return { error: "Pick the date from the calendar." };
  return writeStage(
    input.plotId,
    input.groupId,
    { days, pinned_start: pinnedStart || null },
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
