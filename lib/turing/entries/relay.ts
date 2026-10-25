/** Relay: trails and their batons, the project schedule, and the lists trails are made from. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

const trail: Field = { key: "chain_id", label: "Trail", kind: "id", table: "pusher_chains" };
const project: Field = { key: "project_id", label: "Project", kind: "id", table: "projects" };
const projectStage: Field = {
  key: "stage_id",
  label: "Stage",
  kind: "id",
  table: "project_stages",
  record: true,
};
const trailType: Field = {
  key: "type_id",
  label: "Trail type",
  kind: "id",
  table: "pusher_trail_sets",
};
const activity: Field = {
  key: "activity_id",
  label: "Activity",
  kind: "id",
  table: "pusher_activities",
};
const departments: Field = {
  key: "departments",
  label: "Departments",
  kind: "text",
  optional: true,
  max: 300,
};

/** Relay's bounce reasons, as `BOUNCE_REASONS` in lib/relay/events.ts has them (a test holds the two together). */
export const BOUNCE_REASONS = {
  rework: "Needs rework",
  missing_info: "Missing information",
  wrong_person: "Wrong person",
  client_change: "Client changed something",
  other: "Something else",
} as const;

const DEPARTMENTS =
  "departments is their names, comma-separated, from pusher_departments (switched-on ones).";

const given = (values: Record<string, Value>, key: string) => key in values && values[key] !== "";

/**
 * Department names as the admin wrote them, matched to Relay's departments ignoring case. `allowed`
 * are the ones that may be picked: the switched-on ones, and any the trail already carries.
 */
export function departmentIdsFrom(
  text: string,
  allowed: { id: string; name: string }[],
): { ids: string[] } | { error: string } {
  const names = text
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const ids: string[] = [];
  for (const name of names) {
    const match = allowed.find((one) => one.name.toLowerCase() === name.toLowerCase());
    if (!match) return { error: `There is no department called "${name}" to pick.` };
    if (!ids.includes(match.id)) ids.push(match.id);
  }
  return { ids };
}

export type TypeItem = { activityId: string; expectedDays: number };

/**
 * A trail type's list after one change, as the type's editor makes it: an activity not on it is
 * added (at the end, or at `position`) with 2 days unless said; one on it takes its new days or
 * place, or comes off. A change that changes nothing is refused.
 */
export function typeListAfter(
  items: TypeItem[],
  change: { activityId: string; days?: number; position?: number; remove?: boolean },
): { items: TypeItem[] } | { error: string } {
  const at = items.findIndex((item) => item.activityId === change.activityId);
  if (change.remove) {
    if (at < 0) return { error: "That activity is not in this trail type." };
    return { items: items.filter((_, index) => index !== at) };
  }
  const rest = items.filter((_, index) => index !== at);
  const position = change.position ?? (at < 0 ? items.length + 1 : at + 1);
  if (position > rest.length + 1)
    return {
      error: `This trail type has ${items.length} activities; a place is 1 to ${rest.length + 1}.`,
    };
  const item = {
    activityId: change.activityId,
    expectedDays: change.days ?? (at < 0 ? 2 : items[at].expectedDays),
  };
  if (at >= 0 && position === at + 1 && item.expectedDays === items[at].expectedDays)
    return { error: "That activity already has those days, in that place." };
  return { items: [...rest.slice(0, position - 1), item, ...rest.slice(position - 1)] };
}

export const RELAY = defineEntries([
  {
    key: "relay_trail_new",
    tool: "/relay",
    title: "A trail, opened",
    description: `Opens a trail on a project, or one villa of it (units.id): its activities in order, each with the person who carries it and their days (at least 1), each activity once. type_id records the trail type it was filled from. start_now false queues it on the villa instead of starting it. ${DEPARTMENTS}`,
    adds: true,
    lines: { noun: "Trail" },
    fields: [
      { ...project, header: true },
      {
        key: "unit_id",
        label: "Villa",
        kind: "id",
        table: "units",
        optional: true,
        header: true,
        blank: "The project as a whole",
      },
      { key: "title", label: "Title", kind: "text", optional: true, max: 120, header: true },
      { ...trailType, optional: true, header: true },
      { ...departments, header: true },
      {
        key: "start_now",
        label: "Start now",
        kind: "yesno",
        optional: true,
        start: true,
        header: true,
      },
      activity,
      { key: "person_id", label: "Carried by", kind: "id", table: "profiles" },
      { key: "days", label: "Days", kind: "whole" },
    ],
  },
  {
    key: "relay_type_apply",
    tool: "/relay",
    title: "A trail type, queued on a villa",
    description:
      "Lays a switched-on trail type down on a villa (units.id) as one queued trail, each activity carried by whoever last carried it, with the type's days; an activity nobody has carried yet is refused. Start it with relay_trail_start.",
    fields: [{ key: "unit_id", label: "Villa", kind: "id", table: "units" }, trailType],
  },
  {
    key: "relay_trail_start",
    tool: "/relay",
    title: "A queued trail, started",
    description:
      "Starts a queued trail (pusher_chain_state.is_queued): the baton goes to its first leg.",
    fields: [{ ...trail, record: true }],
  },
  {
    key: "relay_trail_discard",
    tool: "/relay",
    title: "A queued trail, removed",
    description:
      "Removes a queued trail that never started. A started trail is never removed: finish it with a note instead.",
    fields: [{ ...trail, record: true }],
  },
  {
    key: "relay_move",
    tool: "/relay",
    title: "A baton, moved",
    description:
      "Moves a running trail's baton, as its holder would: push to the next leg, finish from the last leg, bounce back to an earlier leg (to_leg, a reason and a note saying what must change), with_client marks the work as with the client (the clock keeps running), client_back takes it back. leg is the leg the baton is on now (pusher_chain_state.current_leg); if it has moved since, the move is refused.",
    check: (values) => {
      const leg = Number(values.leg);
      if (leg < 1) return "The leg is 1 or more.";
      if (values.move === "bounce") {
        if (!given(values, "to_leg") || !given(values, "reason") || !given(values, "note"))
          return "A bounce needs the leg it goes back to, a reason and a note.";
        if (Number(values.to_leg) < 1 || Number(values.to_leg) >= leg)
          return "A bounce goes back, to a leg before this one.";
      } else if (given(values, "to_leg") || given(values, "reason")) {
        return "Only a bounce takes a leg to go back to and a reason.";
      }
      return undefined;
    },
    fields: [
      { ...trail, record: true },
      { key: "leg", label: "On leg", kind: "whole" },
      {
        key: "move",
        label: "Move",
        kind: "choice",
        choices: ["push", "finish", "bounce", "with_client", "client_back"],
        labels: {
          push: "Push forward",
          finish: "Finish the trail",
          bounce: "Bounce back",
          with_client: "It is with the client",
          client_back: "The client sent it back",
        },
      },
      { key: "to_leg", label: "Back to leg", kind: "whole", optional: true },
      {
        key: "reason",
        label: "Reason",
        kind: "choice",
        optional: true,
        choices: Object.keys(BOUNCE_REASONS),
        labels: BOUNCE_REASONS,
      },
      { key: "note", label: "Note", kind: "text", optional: true },
    ],
  },
  {
    key: "relay_hand",
    tool: "/relay",
    title: "A baton, handed to someone else",
    description:
      "Moves a running trail's baton to another person without moving the trail, with a note saying why; the leg's clock keeps running. For when the holder is away or has left.",
    fields: [
      { ...trail, record: true },
      { key: "person_id", label: "Hand to", kind: "id", table: "profiles" },
      { key: "note", label: "Why", kind: "text" },
    ],
  },
  {
    key: "relay_trail_stage",
    tool: "/relay",
    title: "A trail, filed under a stage",
    description:
      "Files a trail under one of its project's schedule stages (project_stages), or none (empty). A trail files itself when it opens; this is the correction. A finished trail keeps its stage.",
    check: (values) =>
      "stage_id" in values ? undefined : "Give the stage, or empty for no stage.",
    fields: [
      { ...trail, record: true },
      { key: "stage_id", label: "Stage", kind: "id", table: "project_stages", optional: true },
    ],
  },
  {
    key: "relay_trail_departments",
    tool: "/relay",
    title: "A trail's departments",
    description: `Sets the departments a running trail touches, replacing the ones it has; empty takes them all off. ${DEPARTMENTS}`,
    check: (values) =>
      "departments" in values ? undefined : "Give the departments, or empty for none.",
    fields: [{ ...trail, record: true }, departments],
  },
  {
    key: "relay_project_start",
    tool: "/relay",
    title: "A project's start date",
    description:
      "The day a project's schedule starts; every stage's dates are worked out from it and the stages' weeks.",
    fields: [project, { key: "start_date", label: "Starts", kind: "date" }],
  },
  {
    key: "relay_project_stage_new",
    tool: "/relay",
    title: "A schedule stage, added",
    description:
      "Adds a stage to the end of a project's schedule, with its length in weeks (at least 1).",
    adds: true,
    fields: [
      project,
      { key: "name", label: "Name", kind: "text", max: 80 },
      { key: "weeks", label: "Weeks", kind: "whole" },
    ],
  },
  {
    key: "relay_project_stage_change",
    tool: "/relay",
    title: "A schedule stage, changed",
    description: "Renames a project's schedule stage (project_stages.id) or changes its weeks.",
    check: (values) =>
      "name" in values || "weeks" in values
        ? undefined
        : "Say what changes: the name or the weeks.",
    fields: [
      projectStage,
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 80 },
      { key: "weeks", label: "Weeks", kind: "whole", optional: true, keep: true },
    ],
  },
  {
    key: "relay_project_stage_delete",
    tool: "/relay",
    title: "A schedule stage, removed",
    description:
      "Removes a stage from a project's schedule. A stage that still has trails filed under it is refused.",
    fields: [projectStage],
  },
  {
    key: "relay_project_stage_move",
    tool: "/relay",
    title: "A schedule stage, moved",
    description: "Swaps a schedule stage with the one before it (up) or after it (down).",
    fields: [
      projectStage,
      { key: "direction", label: "Move", kind: "choice", choices: ["up", "down"] },
    ],
  },
  {
    key: "relay_list_new",
    tool: "/relay",
    title: "An activity, department or trail type, added",
    description:
      "Adds to one of Relay's lists: an activity a trail's legs are made of, a department trails are tagged with, or a trail type (empty; put activities in it with relay_type_activity).",
    adds: true,
    fields: [
      {
        key: "list",
        label: "List",
        kind: "choice",
        choices: ["activity", "department", "trail_type"],
        labels: { activity: "Activity", department: "Department", trail_type: "Trail type" },
      },
      { key: "name", label: "Name", kind: "text", max: 80 },
    ],
  },
  {
    key: "relay_list_active",
    tool: "/relay",
    title: "An activity, department or trail type, switched on or off",
    description:
      "Switches one of Relay's activities, departments or trail types off (no longer offered) or back on: give exactly one of activity_id, department_id or type_id.",
    check: (values) =>
      ["activity_id", "department_id", "type_id"].filter((key) => given(values, key)).length === 1
        ? undefined
        : "Name exactly one activity, department or trail type.",
    fields: [
      { ...activity, optional: true },
      {
        key: "department_id",
        label: "Department",
        kind: "id",
        table: "pusher_departments",
        optional: true,
      },
      { ...trailType, optional: true },
      { key: "active", label: "Switched on", kind: "yesno" },
    ],
  },
  {
    key: "relay_type_activity",
    tool: "/relay",
    title: "A trail type's activity",
    description:
      "Changes one activity of a trail type: one not in it is added (switched-on activities only; at the end unless position is given, with 2 days unless days is given); one in it takes new days or a new position (1 is first), or remove true takes it out.",
    check: (values) => {
      if (values.remove === true && (given(values, "days") || given(values, "position")))
        return "Taking an activity out takes no days or place.";
      if (given(values, "days") && Number(values.days) < 1) return "Days are at least 1.";
      if (given(values, "position") && Number(values.position) < 1) return "A place is 1 or more.";
      return undefined;
    },
    fields: [
      { ...trailType, record: true },
      activity,
      { key: "days", label: "Days", kind: "whole", optional: true },
      { key: "position", label: "Place", kind: "whole", optional: true },
      { key: "remove", label: "Take out", kind: "yesno", optional: true },
    ],
  },
]);
