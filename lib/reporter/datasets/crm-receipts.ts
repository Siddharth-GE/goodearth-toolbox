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

const CRM_RECEIPTS_SELECT =
  "id, engagement_id, project_id, unit_id, project_name, unit_name, client_id, client_name, " +
  "milestone_id, milestone_stage, amount, received_on, mode, reference, created_at";

const CRM_RECEIPTS_OPTIONS_SELECT = "milestone_stage, mode, client_name";

export const crmReceipts: DatasetDef = {
  label: "Client receipts",
  description: "Every rupee received from a client, receipt by receipt.",
  source: "crm_receipt_facts",
  select: CRM_RECEIPTS_SELECT,
  optionsSelect: CRM_RECEIPTS_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["received_on"],
  money: true,
  defaultColumns: ["project", "unit", "client", "amount", "mode", "milestone_stage", "received_on"], // prettier-ignore
  defaultSort: [{ field: "received_on", dir: "desc" }],
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
    amount: {
      label: "Amount",
      type: "money",
      path: "amount",
      filterColumn: "amount",
      sortColumn: "amount",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    mode: {
      label: "Mode",
      type: "text",
      path: "mode",
      filterColumn: "mode",
      sortColumn: "mode",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    // Blank when the receipt is not yet allocated to a rung — an
    // honest gap, not a mistake.
    milestone_stage: {
      label: "Against stage",
      type: "text",
      path: "milestone_stage",
      filterColumn: "milestone_stage",
      sortColumn: "milestone_stage",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    reference: {
      label: "Reference",
      type: "text",
      path: "reference",
      groupable: false,
      aggregates: [],
    },
    received_on: {
      label: "Received on",
      type: "date",
      path: "received_on",
      filterColumn: "received_on",
      sortColumn: "received_on",
      groupable: false,
      aggregates: [],
    },
  },
};
