import "server-only";

import type { ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
// The one sanctioned exception to "no tool imports another" (CLAUDE.md): Turing presses each tool's
// own save, and only after the admin pressed Save on the proposal. Actions only — never queries or screens.
import {
  setFirstPlan,
  setStageContractor,
  setStageDates,
  setStageFollows,
  setStageNeeded,
  setStagePlan,
  setStageStatus,
  setVillaStart,
  setVillaSupervisor,
  type StageSnapshot,
} from "@/lib/supervisors/programme-actions";
import { setSequenceDays } from "@/lib/supervisors/sequence-actions";

import type { Value } from "./catalogue-fields";

type Values = Record<string, Value>;
const text = (values: Values, key: string) => String(values[key] ?? "");

/** A stage as it stands, for the status save, which works from where the stage is now. */
async function currentStage(
  plotId: string,
  groupId: string,
): Promise<StageSnapshot | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_stages")
    .select("status, waiting_on, waiting_note, started_on, finished_on, status_changed_at")
    .eq("plot_id", plotId)
    .eq("work_group_id", groupId)
    .maybeSingle();
  if (error) {
    console.error("turing: stage read failed:", error);
    return { error: "Could not read the stage. Try again." };
  }
  return {
    status: (data?.status ?? "not_started") as StageSnapshot["status"],
    waitingOn: (data?.waiting_on ?? null) as StageSnapshot["waitingOn"],
    waitingNote: data?.waiting_note ?? null,
    startedOn: data?.started_on ?? null,
    finishedOn: data?.finished_on ?? null,
    statusChangedAt: data?.status_changed_at ?? null,
  };
}

/** Each entry in catalogue-fields.ts, run through its tool's own action, as the admin. */
export const RUNNERS: Record<string, (values: Values) => Promise<ActionState>> = {
  villa_start: (v) => setVillaStart({ plotId: text(v, "plot_id"), startOn: text(v, "start_on") }),
  villa_supervisor: (v) =>
    setVillaSupervisor({ plotId: text(v, "plot_id"), supervisorId: text(v, "supervisor_id") }),
  first_plan: (v) => setFirstPlan({ plotId: text(v, "plot_id"), note: text(v, "note") }),
  stage_plan: (v) =>
    setStagePlan({
      plotId: text(v, "plot_id"),
      groupId: text(v, "group_id"),
      days: text(v, "days"),
      pinnedStart: text(v, "pinned_start"),
    }),
  stage_dates: (v) =>
    setStageDates({
      plotId: text(v, "plot_id"),
      groupId: text(v, "group_id"),
      startedOn: text(v, "started_on"),
      finishedOn: text(v, "finished_on"),
    }),
  stage_status: async (v) => {
    const current = await currentStage(text(v, "plot_id"), text(v, "group_id"));
    if ("error" in current) return current;
    return setStageStatus({
      plotId: text(v, "plot_id"),
      groupId: text(v, "group_id"),
      status: text(v, "status"),
      current,
      waitingOn: text(v, "waiting_on") || undefined,
      waitingNote: text(v, "waiting_note") || undefined,
    });
  },
  stage_contractor: (v) =>
    setStageContractor({
      plotId: text(v, "plot_id"),
      groupId: text(v, "group_id"),
      contractorId: text(v, "contractor_id"),
    }),
  stage_needed: (v) =>
    setStageNeeded({
      plotId: text(v, "plot_id"),
      groupId: text(v, "group_id"),
      needed: v.needed === true,
    }),
  stage_follows: (v) =>
    setStageFollows({
      plotId: text(v, "plot_id"),
      groupId: text(v, "group_id"),
      followsGroupId: text(v, "follows_group_id"),
      link: text(v, "link"),
    }),
  sequence_days: (v) =>
    setSequenceDays({
      groupId: text(v, "group_id"),
      field: text(v, "field") === "wait" ? "wait" : "typical",
      value: text(v, "value"),
    }),
};
