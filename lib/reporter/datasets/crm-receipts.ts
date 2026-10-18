// TWO DATASETS, NEVER ONE JOIN: a milestone with three receipts fans out to three rows and any
// sum(due_amount) triples. The one crossing is the view's own aggregate: received_amount, the SUM
// of the milestone's receipts. A receipt not yet allocated appears only in crm_receipts, so "total
// received" belongs there. Both read 0056's flat views.

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
    // Blank when the receipt is not yet allocated to a rung.
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
