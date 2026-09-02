// ---------------------------------------------------------------------
// plan_targets — a plan's published numbers beside the project's actuals
// ---------------------------------------------------------------------
// Reads 0057's view: one row per plan a founder has LINKED to a project
// (an unlinked plan publishes nothing). The actuals are the view's own
// per-project aggregates — billed spend and client collections — so no
// report ever joins plan rows to bill or receipt rows. Money, gated by
// the view's WHERE: /business-planning or /reporter.

import type { DatasetDef } from "./types";

const PLAN_TARGETS_SELECT =
  "id, plan_id, plan_name, scenario_name, project_id, project_name, revenue, total_cost, " +
  "pbt, margin_pct, peak_funding, actual_spend, actual_collections, published_at";

export const planTargets: DatasetDef = {
  label: "Plan targets",
  description:
    "Every published business plan's headline numbers, beside what the project has actually billed and collected so far.",
  source: "business_plan_target_facts",
  select: PLAN_TARGETS_SELECT,
  optionsSelect: "scenario_name",
  projectField: "project",
  dateFields: ["published_on"],
  money: true,
  defaultColumns: ["project", "plan", "scenario", "revenue", "actual_collections", "total_cost", "actual_spend", "pbt"], // prettier-ignore
  defaultSort: [{ field: "revenue", dir: "desc" }],
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
    plan: {
      label: "Plan",
      type: "text",
      path: "plan_name",
      identityPath: "plan_id",
      sortColumn: "plan_name",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    scenario: {
      label: "Scenario",
      type: "text",
      path: "scenario_name",
      filterColumn: "scenario_name",
      sortColumn: "scenario_name",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    revenue: {
      label: "Planned revenue",
      type: "money",
      path: "revenue",
      filterColumn: "revenue",
      sortColumn: "revenue",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    total_cost: {
      label: "Planned cost",
      type: "money",
      path: "total_cost",
      filterColumn: "total_cost",
      sortColumn: "total_cost",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    pbt: {
      label: "Planned profit",
      type: "money",
      path: "pbt",
      filterColumn: "pbt",
      sortColumn: "pbt",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    margin_pct: {
      label: "Planned margin %",
      type: "number",
      path: "margin_pct",
      filterColumn: "margin_pct",
      sortColumn: "margin_pct",
      groupable: false,
      aggregates: ["avg", "min", "max"],
    },
    peak_funding: {
      label: "Peak funding",
      type: "money",
      path: "peak_funding",
      filterColumn: "peak_funding",
      sortColumn: "peak_funding",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    actual_spend: {
      label: "Actual billed spend",
      type: "money",
      path: "actual_spend",
      filterColumn: "actual_spend",
      sortColumn: "actual_spend",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    actual_collections: {
      label: "Actual collections",
      type: "money",
      path: "actual_collections",
      filterColumn: "actual_collections",
      sortColumn: "actual_collections",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    published_on: {
      label: "Published on",
      type: "date",
      path: "published_at",
      filterColumn: "published_at",
      sortColumn: "published_at",
      groupable: false,
      aggregates: [],
    },
  },
};
