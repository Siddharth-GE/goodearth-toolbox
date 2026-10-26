import "server-only";

import {
  addProjectStage,
  applyTrailSet,
  bounceBaton,
  clientReturned,
  createActivity,
  createDepartment,
  createTrailSet,
  deleteProjectStage,
  discardTrail,
  finishTrail,
  handBaton,
  holdForClient,
  moveProjectStage,
  openTrail,
  pushBaton,
  setActivityActive,
  setDepartmentActive,
  setProjectStart,
  setTrailDepartments,
  setTrailSetActive,
  setTrailSetActivities,
  setTrailStage,
  startTrail,
  updateProjectStage,
} from "@/lib/relay/actions";
import { createClient } from "@/lib/supabase/server";

import { departmentIdsFrom, typeListAfter, type RELAY } from "../entries/relay";
import { failed, given, recordNow, type Runners, type Values } from "./kit";

type Failure = { error: string };
type Trail = {
  project_id: string | null;
  unit_id: string | null;
  current_leg: number | null;
  leg_count: number | null;
  holder_id: string | null;
  is_finished: boolean | null;
  is_queued: boolean | null;
  is_with_client: boolean | null;
  project_stage_id: string | null;
};

async function trailNow(chainId: string): Promise<{ trail: Trail } | Failure> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pusher_chain_state")
    .select(
      "project_id, unit_id, current_leg, leg_count, holder_id, is_finished, is_queued, is_with_client, project_stage_id",
    )
    .eq("chain_id", chainId)
    .maybeSingle();
  if (error) return failed("trail", error);
  if (!data) return { error: "That trail is gone." };
  return { trail: data };
}

/** Only a running trail's baton moves, as the trail page offers. */
function notRunning(trail: Trail): Failure | null {
  if (trail.is_queued)
    return { error: "This trail is queued and has not started; start it first." };
  if (trail.is_finished) return { error: "This trail is finished; nothing more can happen to it." };
  return null;
}

type ListTable = "pusher_activities" | "pusher_departments" | "pusher_trail_sets";

/** One of Relay's lists whole: a few dozen rows at most. */
async function listOf(
  table: ListTable,
): Promise<{ rows: { id: string; name: string; is_active: boolean }[] } | Failure> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).select("id, name, is_active");
  if (error) return failed(table, error);
  return { rows: data ?? [] };
}

/** A trail type the screens offer: there and switched on. */
async function typeOffered(typeId: string): Promise<{ name: string } | Failure> {
  const now = await recordNow(
    "pusher_trail_sets",
    { column: "id", id: typeId },
    ["name", "is_active"],
    "That trail type is gone.",
  );
  if ("error" in now) return now;
  return now.row.is_active
    ? { name: String(now.row.name) }
    : { error: "That trail type is switched off." };
}

/** A queued trail's Start and Remove sit on its villa's queue; one on the project as a whole has neither. */
function notOnQueue(trail: Trail): Failure | null {
  return trail.unit_id
    ? null
    : { error: "Only a trail queued on a villa can be started or removed from its queue." };
}

/** The villa's project, which every trail on it belongs to. */
async function projectOfUnit(unitId: string): Promise<{ projectId: string } | Failure> {
  const unit = await recordNow(
    "units",
    { column: "id", id: unitId },
    ["project_id"],
    "That villa is gone.",
  );
  if ("error" in unit) return unit;
  return { projectId: String(unit.row.project_id) };
}

async function stageNow(stageId: string) {
  return recordNow(
    "project_stages",
    { column: "id", id: stageId },
    ["project_id", "name", "weeks"],
    "That stage is gone.",
  );
}

/** Opening a trail tags its departments as a second step whose failure the open only logs; said here. */
async function departmentsLanded(chainId: string): Promise<Failure | undefined> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("pusher_chain_departments")
    .select("department_id", { count: "exact", head: true })
    .eq("chain_id", chainId);
  if (error) return failed("trail departments", error);
  return count
    ? undefined
    : { error: "The trail is open, but its departments did not save; set them on the trail." };
}

const noteOf = (values: Values) => (typeof values.note === "string" ? values.note : "");

const LIST_TABLE = {
  activity_id: "pusher_activities",
  department_id: "pusher_departments",
  type_id: "pusher_trail_sets",
} as const;

/** Each Relay entry, run through Relay's own action, as the admin. */
export const RELAY_RUNNERS: Runners<(typeof RELAY)[number]["key"]> = {
  relay_trail_new: {
    lines: async (header, lines) => {
      const projectId = String(header.project_id);
      const unitId = header.unit_id ? String(header.unit_id) : null;
      const typeId = header.type_id ? String(header.type_id) : null;
      if (unitId) {
        const unit = await projectOfUnit(unitId);
        if ("error" in unit) return unit;
        if (unit.projectId !== projectId) return { error: "That villa is in another project." };
      }
      let typeName: string | null = null;
      if (typeId) {
        const type = await typeOffered(typeId);
        if ("error" in type) return type;
        typeName = type.name;
      }
      const [activities, departments] = await Promise.all([
        listOf("pusher_activities"),
        listOf("pusher_departments"),
      ]);
      if ("error" in activities) return activities;
      if ("error" in departments) return departments;
      for (const line of lines) {
        const one = activities.rows.find((row) => row.id === line.activity_id);
        if (!one) return { error: "One of those activities is gone." };
        if (!one.is_active) return { error: `${one.name} is switched off in Relay.` };
      }
      const tags = departmentIdsFrom(String(header.departments ?? ""), departments.rows);
      if ("error" in tags) return tags;
      const legs = lines.map((line) => ({
        activityId: String(line.activity_id),
        assigneeId: String(line.person_id),
        expectedDays: Number(line.days),
      }));
      const opened = await openTrail({
        projectId,
        unitId,
        // A one-step trail records its activity, as the screen's form does.
        activityId: legs.length === 1 ? legs[0].activityId : null,
        trailSetId: typeId,
        // A trail filled from a type is named after it, as the form fills an empty title.
        title: header.title ? String(header.title) : typeName,
        note: null,
        legs,
        departmentIds: tags.ids,
        start: header.start_now !== false,
      });
      if (opened.error) return { error: opened.error };
      return tags.ids.length > 0 && opened.chainId ? departmentsLanded(opened.chainId) : undefined;
    },
  },
  relay_type_apply: async (v) => {
    const unit = await projectOfUnit(String(v.unit_id));
    if ("error" in unit) return unit;
    const type = await typeOffered(String(v.type_id));
    if ("error" in type) return type;
    return applyTrailSet(unit.projectId, String(v.unit_id), String(v.type_id));
  },
  relay_trail_start: async (v) => {
    const now = await trailNow(String(v.chain_id));
    if ("error" in now) return now;
    if (!now.trail.is_queued) return { error: "This trail has already started." };
    const refused = notOnQueue(now.trail);
    if (refused) return refused;
    return startTrail(String(v.chain_id));
  },
  relay_trail_discard: async (v) => {
    const now = await trailNow(String(v.chain_id));
    if ("error" in now) return now;
    if (!now.trail.is_queued)
      return { error: "This trail has started; finish it with a note instead of removing it." };
    const refused = notOnQueue(now.trail);
    if (refused) return refused;
    return discardTrail(String(v.chain_id));
  },
  relay_move: async (v) => {
    const chainId = String(v.chain_id);
    const now = await trailNow(chainId);
    if ("error" in now) return now;
    const refused = notRunning(now.trail);
    if (refused) return refused;
    const leg = Number(v.leg);
    const legs = now.trail.leg_count ?? 0;
    if (now.trail.current_leg !== leg)
      return {
        error: `The baton is on leg ${now.trail.current_leg}, not leg ${leg}; it moved since. Ask Turing again.`,
      };
    const note = noteOf(v);
    switch (v.move) {
      case "push":
        if (leg >= legs) return { error: "This is the trail's last leg: finish it instead." };
        return pushBaton(chainId, leg, note);
      case "finish":
        if (leg < legs)
          return { error: `A trail is finished from its last leg; this is leg ${leg} of ${legs}.` };
        return finishTrail(chainId, leg, note);
      case "bounce":
        return bounceBaton(chainId, leg, Number(v.to_leg), String(v.reason), note);
      case "with_client":
        if (now.trail.is_with_client) return { error: "This trail is already with the client." };
        return holdForClient(chainId, leg, note);
      default:
        if (!now.trail.is_with_client) return { error: "This trail is not with the client." };
        return clientReturned(chainId, leg, note);
    }
  },
  relay_hand: async (v) => {
    const now = await trailNow(String(v.chain_id));
    if ("error" in now) return now;
    const refused = notRunning(now.trail);
    if (refused) return refused;
    if (now.trail.holder_id === v.person_id) return { error: "They already hold this baton." };
    return handBaton(String(v.chain_id), String(v.person_id), noteOf(v));
  },
  relay_trail_stage: async (v) => {
    const now = await trailNow(String(v.chain_id));
    if ("error" in now) return now;
    if (now.trail.is_finished)
      return { error: "A finished trail keeps its stage, or the schedule's past would change." };
    const stageId = v.stage_id ? String(v.stage_id) : null;
    if (stageId) {
      const stage = await stageNow(stageId);
      if ("error" in stage) return stage;
      if (stage.row.project_id !== now.trail.project_id)
        return { error: "That stage is in another project's schedule." };
    }
    if (stageId === (now.trail.project_stage_id ?? null))
      return { error: "The trail is already filed there." };
    return setTrailStage(String(v.chain_id), stageId);
  },
  relay_trail_departments: async (v) => {
    const chainId = String(v.chain_id);
    const now = await trailNow(chainId);
    if ("error" in now) return now;
    if (now.trail.is_finished)
      return { error: "A finished trail keeps its departments, so past reports don't change." };
    const supabase = await createClient();
    const [departments, tagged] = await Promise.all([
      listOf("pusher_departments"),
      supabase.from("pusher_chain_departments").select("department_id").eq("chain_id", chainId),
    ]);
    if ("error" in departments) return departments;
    if (tagged.error) return failed("trail departments", tagged.error);
    const current = new Set((tagged.data ?? []).map((row) => row.department_id));
    const tags = departmentIdsFrom(String(v.departments), departments.rows, current);
    if ("error" in tags) return tags;
    if (tags.ids.length === current.size && tags.ids.every((id) => current.has(id)))
      return { error: "The trail already has those departments." };
    return setTrailDepartments(chainId, tags.ids);
  },
  relay_project_start: async (v) => {
    const plan = await recordNow(
      "pusher_project_plans",
      { column: "project_id", id: String(v.project_id) },
      ["start_date"],
      null,
    );
    if ("error" in plan) return plan;
    if (plan.row.start_date === v.start_date) return { error: "The project already starts then." };
    return setProjectStart(String(v.project_id), String(v.start_date));
  },
  relay_project_stage_new: (v) =>
    addProjectStage(String(v.project_id), String(v.name), Number(v.weeks)),
  relay_project_stage_change: async (v) => {
    const now = await stageNow(String(v.stage_id));
    if ("error" in now) return now;
    const name = given(v, "name", now.row.name as string);
    const weeks = Number(given(v, "weeks", now.row.weeks as number));
    if (name === now.row.name && weeks === now.row.weeks)
      return { error: "That stage already has that name and those weeks." };
    return updateProjectStage(String(v.stage_id), String(now.row.project_id), name, weeks);
  },
  relay_project_stage_delete: async (v) => {
    // The delete says nothing when no row matched, so a stage already gone is said here.
    const now = await stageNow(String(v.stage_id));
    if ("error" in now) return now;
    return deleteProjectStage(String(v.stage_id));
  },
  relay_project_stage_move: async (v) => {
    const now = await stageNow(String(v.stage_id));
    if ("error" in now) return now;
    const projectId = String(now.row.project_id);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_stages")
      .select("id")
      .eq("project_id", projectId)
      .order("sort_order")
      .order("id");
    if (error) return failed("project stages", error);
    // The move does nothing at either end, without a word; said here instead.
    const at = (data ?? []).findIndex((row) => row.id === v.stage_id);
    if (v.direction === "up" && at === 0) return { error: "That stage is already first." };
    if (v.direction === "down" && at === (data ?? []).length - 1)
      return { error: "That stage is already last." };
    return moveProjectStage(String(v.stage_id), projectId, v.direction === "up" ? "up" : "down");
  },
  relay_list_new: (v) => {
    const form = new FormData();
    form.set("name", String(v.name));
    if (v.list === "department") return createDepartment(undefined, form);
    if (v.list === "trail_type") return createTrailSet(undefined, form);
    return createActivity(undefined, form);
  },
  relay_list_active: async (v) => {
    const key = (Object.keys(LIST_TABLE) as (keyof typeof LIST_TABLE)[]).find((one) => v[one]);
    if (!key) return { error: "Name an activity, department or trail type." };
    const id = String(v[key]);
    const now = await recordNow(
      LIST_TABLE[key],
      { column: "id", id },
      ["is_active"],
      "That one is gone.",
    );
    if ("error" in now) return now;
    const active = v.active === true;
    if (now.row.is_active === active)
      return { error: `It is already switched ${active ? "on" : "off"}.` };
    if (key === "department_id") return setDepartmentActive(id, active);
    if (key === "type_id") return setTrailSetActive(id, active);
    return setActivityActive(id, active);
  },
  relay_type_activity: async (v) => {
    const typeId = String(v.type_id);
    const type = await recordNow(
      "pusher_trail_sets",
      { column: "id", id: typeId },
      ["id"],
      "That trail type is gone.",
    );
    if ("error" in type) return type;
    const supabase = await createClient();
    const [items, activities] = await Promise.all([
      supabase
        .from("pusher_trail_set_items")
        .select("activity_id, expected_days")
        .eq("set_id", typeId)
        .order("sort_order")
        .order("id"),
      listOf("pusher_activities"),
    ]);
    if (items.error) return failed("trail type activities", items.error);
    if ("error" in activities) return activities;
    const list = (items.data ?? []).map((row) => ({
      activityId: row.activity_id,
      expectedDays: row.expected_days,
    }));
    const activityId = String(v.activity_id);
    if (!list.some((item) => item.activityId === activityId)) {
      // Only a switched-on activity is offered to add, as the type's editor lists them.
      const one = activities.rows.find((row) => row.id === activityId);
      if (!one) return { error: "That activity is gone." };
      if (!one.is_active && v.remove !== true)
        return { error: `${one.name} is switched off in Relay.` };
    }
    const after = typeListAfter(list, {
      activityId,
      days: v.days ? Number(v.days) : undefined,
      position: v.position ? Number(v.position) : undefined,
      remove: v.remove === true,
    });
    if ("error" in after) return after;
    return setTrailSetActivities(typeId, after.items);
  },
};
