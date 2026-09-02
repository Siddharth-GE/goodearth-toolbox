// ---------------------------------------------------------------------
// relay_chains — every trail and where its baton is
// ---------------------------------------------------------------------
// Reads pusher_chain_state — Reporter is now that view's THIRD consumer
// (Relay, Client Relations, Reporter); a sixth redefinition must check
// here too (CLAUDE.md's warning). The view is flat and already carries
// its names. department_names is an array, which extractRows cannot
// flatten — it stays out until someone actually asks for it.

import type { DatasetDef } from "./types";

const RELAY_CHAINS_SELECT =
  "chain_id, title, project_id, project_name, unit_id, unit_name, trail_set_name, " +
  "activity_name, current_leg, leg_count, days_in_leg, expected_days, " +
  "is_stuck, is_queued, is_finished, started_at, entered_at";

const RELAY_CHAINS_OPTIONS_SELECT = "trail_set_name, activity_name";

export const relayChains: DatasetDef = {
  label: "Relay trails",
  description: "Every trail and where its baton is — the current activity, and for how long.",
  source: "pusher_chain_state",
  select: RELAY_CHAINS_SELECT,
  optionsSelect: RELAY_CHAINS_OPTIONS_SELECT,
  projectField: "project",
  pageOrder: ["chain_id"],
  dateFields: ["started_on", "entered_on"],
  money: false,
  defaultColumns: ["project", "trail", "activity", "current_leg", "days_in_leg", "expected_days", "stuck"], // prettier-ignore
  defaultSort: [{ field: "days_in_leg", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "project_name",
      identityPath: "project_id",
      filterColumn: "project_id",
      sortColumn: "project_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "unit_name",
      identityPath: "unit_id",
      filterColumn: "unit_id",
      sortColumn: "unit_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    trail: {
      label: "Trail",
      type: "text",
      path: "title",
      identityPath: "chain_id",
      sortColumn: "title",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    trail_set: {
      label: "Trail type",
      type: "text",
      path: "trail_set_name",
      filterColumn: "trail_set_name",
      sortColumn: "trail_set_name",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    activity: {
      label: "Current activity",
      type: "text",
      path: "activity_name",
      filterColumn: "activity_name",
      sortColumn: "activity_name",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    current_leg: {
      label: "Leg",
      type: "number",
      path: "current_leg",
      filterColumn: "current_leg",
      sortColumn: "current_leg",
      groupable: false,
      aggregates: ["avg", "min", "max"],
    },
    leg_count: {
      label: "Legs in trail",
      type: "number",
      path: "leg_count",
      filterColumn: "leg_count",
      sortColumn: "leg_count",
      groupable: false,
      aggregates: ["avg", "min", "max"],
    },
    days_in_leg: {
      label: "Days on this leg",
      type: "number",
      path: "days_in_leg",
      filterColumn: "days_in_leg",
      sortColumn: "days_in_leg",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    expected_days: {
      label: "Expected days",
      type: "number",
      path: "expected_days",
      filterColumn: "expected_days",
      sortColumn: "expected_days",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    stuck: {
      label: "Stuck",
      type: "bool",
      path: "is_stuck",
      filterColumn: "is_stuck",
      groupable: true,
      aggregates: [],
    },
    queued: {
      label: "Waiting to start",
      type: "bool",
      path: "is_queued",
      filterColumn: "is_queued",
      groupable: true,
      aggregates: [],
    },
    finished: {
      label: "Finished",
      type: "bool",
      path: "is_finished",
      filterColumn: "is_finished",
      groupable: true,
      aggregates: [],
    },
    started_on: {
      label: "Started on",
      type: "date",
      path: "started_at",
      filterColumn: "started_at",
      sortColumn: "started_at",
      groupable: false,
      aggregates: [],
    },
    entered_on: {
      label: "On this leg since",
      type: "date",
      path: "entered_at",
      filterColumn: "entered_at",
      sortColumn: "entered_at",
      groupable: false,
      aggregates: [],
    },
  },
};
