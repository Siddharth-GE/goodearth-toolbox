"use server";

// Type-only import, never re-exported from a "use server" file (check:actions enforces it).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { todayInIndia } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isStageStatus, isWaitingOn, type StageStatus, type WaitingOn } from "./programme";

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
};

function refresh(plotId: string) {
  revalidatePath("/supervisors", "layout");
  revalidatePath(`/supervisors/villas/${plotId}`);
}

async function writeStage(
  plotId: string,
  groupId: string,
  fields: Record<string, string | null>,
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

/** Who runs the villa — the board's Mine / Everyone. A filter, not a permission. */
export async function setVillaSupervisor(input: {
  plotId: string;
  supervisorId: string;
}): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!input.plotId) return { error: "Which villa?" };
  const supabase = await createClient();
  const { error } = await supabase.from("site_villas").upsert(
    {
      plot_id: input.plotId,
      supervisor_id: input.supervisorId || null,
      created_by: user.id,
      updated_by: user.id,
    },
    { onConflict: "plot_id" },
  );
  if (error) {
    console.error("setVillaSupervisor failed:", error);
    return { error: "Could not save who runs this villa. Try again." };
  }
  refresh(input.plotId);
  return undefined;
}
