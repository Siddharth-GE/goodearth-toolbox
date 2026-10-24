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
import { deleteLabourLog, recordLabourLog, updateLabourLog } from "@/lib/supervisors/actions";

import { LABOUR_LOG_FORM, labourConflict, type EntryKey, type Value } from "./catalogue-fields";

type Values = Record<string, Value>;

/** A field Claude left out keeps what is there now; one given empty clears it. */
const given = (values: Values, key: string, now: string | number | null | undefined) =>
  key in values ? String(values[key]) : now === null || now === undefined ? "" : String(now);

type Failure = { error: string };
const failed = (what: string, error: unknown): Failure => {
  console.error(`turing: ${what} read failed:`, error);
  return { error: "Could not read how things stand now. Try again." };
};

async function stageNow(values: Values) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_stages")
    .select(
      "status, waiting_on, waiting_note, started_on, finished_on, status_changed_at, days, pinned_start, contractor_id, follows_group_id, link",
    )
    .eq("plot_id", String(values.plot_id))
    .eq("work_group_id", String(values.group_id))
    .maybeSingle();
  if (error) return failed("stage", error);
  return { stage: data };
}

async function villaNow(values: Values) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_villas")
    .select("start_on, supervisor_id")
    .eq("plot_id", String(values.plot_id))
    .maybeSingle();
  if (error) return failed("villa", error);
  return { villa: data };
}

async function sequenceNow(values: Values) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_sequence")
    .select("typical_days, wait_days")
    .eq("work_group_id", String(values.group_id))
    .maybeSingle();
  if (error) return failed("sequence", error);
  return { sequence: data };
}

async function logNow(values: Values) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labour_logs")
    .select(
      "plot_id, work_item_id, contractor_id, log_date, kind, work_class, masons, helpers, others, quantity, description, note",
    )
    .eq("id", String(values.log_id))
    .maybeSingle();
  if (error) return failed("labour log", error);
  if (!data) return { error: "That log is gone." };
  return { log: data };
}

/** The labour form as Supervisors' own screen sends it; a field left out keeps the log's own. */
function labourForm(values: Values, now?: Record<string, string | number | null>) {
  const form = new FormData();
  for (const key of LABOUR_LOG_FORM) form.set(key, given(values, key, now?.[key]));
  return form;
}

/** Each entry in catalogue-fields.ts, run through its tool's own action, as the admin. */
export const RUNNERS: Record<EntryKey, (values: Values) => Promise<ActionState>> = {
  villa_start: async (v) => {
    const now = await villaNow(v);
    if ("error" in now) return now;
    return setVillaStart({
      plotId: String(v.plot_id),
      startOn: given(v, "start_on", now.villa?.start_on),
    });
  },
  villa_supervisor: async (v) => {
    const now = await villaNow(v);
    if ("error" in now) return now;
    return setVillaSupervisor({
      plotId: String(v.plot_id),
      supervisorId: given(v, "supervisor_id", now.villa?.supervisor_id),
    });
  },
  first_plan: (v) => setFirstPlan({ plotId: String(v.plot_id), note: given(v, "note", "") }),
  stage_plan: async (v) => {
    const now = await stageNow(v);
    if ("error" in now) return now;
    return setStagePlan({
      plotId: String(v.plot_id),
      groupId: String(v.group_id),
      days: given(v, "days", now.stage?.days),
      pinnedStart: given(v, "pinned_start", now.stage?.pinned_start),
    });
  },
  stage_dates: async (v) => {
    const now = await stageNow(v);
    if ("error" in now) return now;
    return setStageDates({
      plotId: String(v.plot_id),
      groupId: String(v.group_id),
      startedOn: given(v, "started_on", now.stage?.started_on),
      finishedOn: given(v, "finished_on", now.stage?.finished_on),
    });
  },
  stage_status: async (v) => {
    const now = await stageNow(v);
    if ("error" in now) return now;
    // The status save works from where the stage is now (a stage with no row is not started).
    const current: StageSnapshot = {
      status: (now.stage?.status ?? "not_started") as StageSnapshot["status"],
      waitingOn: (now.stage?.waiting_on ?? null) as StageSnapshot["waitingOn"],
      waitingNote: now.stage?.waiting_note ?? null,
      startedOn: now.stage?.started_on ?? null,
      finishedOn: now.stage?.finished_on ?? null,
      statusChangedAt: now.stage?.status_changed_at ?? null,
    };
    return setStageStatus({
      plotId: String(v.plot_id),
      groupId: String(v.group_id),
      status: String(v.status),
      current,
      waitingOn: given(v, "waiting_on", now.stage?.waiting_on) || undefined,
      waitingNote: given(v, "waiting_note", now.stage?.waiting_note) || undefined,
    });
  },
  stage_contractor: async (v) => {
    const now = await stageNow(v);
    if ("error" in now) return now;
    return setStageContractor({
      plotId: String(v.plot_id),
      groupId: String(v.group_id),
      contractorId: given(v, "contractor_id", now.stage?.contractor_id),
    });
  },
  stage_needed: (v) =>
    setStageNeeded({
      plotId: String(v.plot_id),
      groupId: String(v.group_id),
      needed: v.needed === true,
    }),
  stage_follows: async (v) => {
    const now = await stageNow(v);
    if ("error" in now) return now;
    return setStageFollows({
      plotId: String(v.plot_id),
      groupId: String(v.group_id),
      followsGroupId: given(v, "follows_group_id", now.stage?.follows_group_id),
      link: given(v, "link", now.stage?.link),
    });
  },
  sequence_days: async (v) => {
    const wait = v.field === "wait";
    const now = await sequenceNow(v);
    if ("error" in now) return now;
    return setSequenceDays({
      groupId: String(v.group_id),
      field: wait ? "wait" : "typical",
      value: given(v, "value", wait ? now.sequence?.wait_days : now.sequence?.typical_days),
    });
  },
  labour_log_new: (v) => recordLabourLog(undefined, labourForm(v)),
  labour_log_change: async (v) => {
    const now = await logNow(v);
    if ("error" in now) return now;
    const conflict = labourConflict(v, now.log);
    if (conflict) return { error: conflict };
    const form = labourForm(v, now.log);
    form.set("id", String(v.log_id));
    return updateLabourLog(undefined, form);
  },
  labour_log_delete: async (v) => {
    // The delete itself says nothing when no row matched, so a log already gone is said here.
    const now = await logNow(v);
    if ("error" in now) return now;
    return deleteLabourLog(String(v.log_id));
  },
};
