// ---------------------------------------------------------------------
// crm_milestones + crm_receipts — the money coming IN (0056)
// ---------------------------------------------------------------------
// TWO DATASETS, NEVER ONE JOIN. A milestone with three receipts fans
// out to three rows in a join, and any sum(due_amount) then triples —
// the easiest way for Reporter to produce a confidently wrong number.
// The one sanctioned crossing is the AGGREGATE the view computes:
// a milestone carries the SUM of its own receipts (received_amount),
// one row per milestone, no fan-out possible. A receipt not yet
// allocated to a milestone appears only in crm_receipts — so "total
// received" belongs there; received_amount answers "how much of THIS
// due is in". Both read 0056's flat views: no embeds, no ambiguity,
// and the prose columns (details, notes, bottlenecks) never left the
// database.

import type { DatasetDef } from "./types";

const CRM_MILESTONES_SELECT =
  "id, engagement_id, project_id, unit_id, project_name, unit_name, client_id, client_name, " +
  "stage, sort_order, due_amount, due_on, invoice_no, invoiced_on, received_amount, created_at";

const CRM_MILESTONES_OPTIONS_SELECT = "stage, client_name";

export const crmMilestones: DatasetDef = {
  label: "Client payment milestones",
  description:
    "Every rung of every villa's payment schedule — what is due, and how much of it is in.",
  source: "crm_milestone_facts",
  select: CRM_MILESTONES_SELECT,
  optionsSelect: CRM_MILESTONES_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["due_on", "invoiced_on"],
  money: true,
  defaultColumns: ["project", "unit", "client", "stage", "due_amount", "received_amount", "balance_due", "due_on"], // prettier-ignore
  defaultSort: [{ field: "due_on", dir: "asc" }],
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
    // Client names can repeat like any names; the id is the identity.
    client: {
      label: "Client",
      type: "text",
      path: "client_name",
      identityPath: "client_id",
      filterColumn: "client_name",
      sortColumn: "client_name",
      groupable: true,
      aggregates: ["count_distinct"],
      filterOptions: "distinct",
    },
    stage: {
      label: "Stage",
      type: "text",
      path: "stage",
      filterColumn: "stage",
      sortColumn: "sort_order",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    due_amount: {
      label: "Due amount",
      type: "money",
      path: "due_amount",
      filterColumn: "due_amount",
      sortColumn: "due_amount",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    received_amount: {
      label: "Received against it",
      type: "money",
      path: "received_amount",
      filterColumn: "received_amount",
      sortColumn: "received_amount",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    balance_due: {
      label: "Balance due",
      type: "money",
      path: "balance_due",
      derive: "crm_balance_due",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    invoice_no: {
      label: "Invoice no.",
      type: "text",
      path: "invoice_no",
      groupable: false,
      aggregates: [],
    },
    due_on: {
      label: "Due on",
      type: "date",
      path: "due_on",
      filterColumn: "due_on",
      sortColumn: "due_on",
      groupable: false,
      aggregates: [],
    },
    invoiced_on: {
      label: "Invoiced on",
      type: "date",
      path: "invoiced_on",
      filterColumn: "invoiced_on",
      sortColumn: "invoiced_on",
      groupable: false,
      aggregates: [],
    },
  },
};
