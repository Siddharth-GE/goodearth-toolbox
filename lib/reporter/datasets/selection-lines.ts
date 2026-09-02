// ---------------------------------------------------------------------
// selection_lines — what design has specified
// ---------------------------------------------------------------------
// Money-free: indicative_rate_snapshot exists on the table and is
// DELIBERATELY not a field here — this dataset is about what was
// specified, not what it costs; budget_report_lines carries the money.
// The selections embed names the COMPOSITE FK (selection_id, unit_id).

import type { DatasetDef } from "./types";

const SELECTION_LINES_SELECT =
  "id, item_id, quantity, uom, designer_note, created_at, " +
  "items!selection_lines_item_id_fkey(name, code), " +
  "selections!selection_lines_selection_id_unit_id_fkey!inner(revision_no, status, unit_id, " +
  "units!selections_unit_id_fkey!inner(name, project_id, projects!units_project_id_fkey(name)))";

const SELECTION_LINES_OPTIONS_SELECT =
  "uom, items!selection_lines_item_id_fkey(name, code), " +
  "selections!selection_lines_selection_id_unit_id_fkey!inner(status)";

export const selectionLines: DatasetDef = {
  label: "Selection lines",
  description: "Every line design has specified, unit by unit, revision by revision.",
  source: "selection_lines",
  select: SELECTION_LINES_SELECT,
  optionsSelect: SELECTION_LINES_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["specified_on"],
  money: false,
  defaultColumns: ["project", "unit", "revision", "status", "item", "quantity", "uom"],
  defaultSort: [{ field: "specified_on", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "selections.units.projects.name",
      identityPath: "selections.units.project_id",
      filterColumn: "selections.units.project_id",
      sortColumn: "selections.units.projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "selections.units.name",
      identityPath: "selections.unit_id",
      filterColumn: "selections.unit_id",
      sortColumn: "selections.units.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    revision: {
      label: "Revision",
      type: "number",
      path: "selections.revision_no",
      filterColumn: "selections.revision_no",
      sortColumn: "selections.revision_no",
      groupable: true,
      aggregates: ["max"],
    },
    status: {
      label: "Revision status",
      type: "text",
      path: "selections.status",
      filterColumn: "selections.status",
      sortColumn: "selections.status",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    item: {
      label: "Item",
      type: "text",
      path: "items.name",
      identityPath: "item_id",
      filterColumn: "items.name",
      sortColumn: "items.name",
      groupable: true,
      aggregates: ["count_distinct"],
      filterOptions: "distinct",
    },
    item_code: {
      label: "Item code",
      type: "text",
      path: "items.code",
      identityPath: "item_id",
      filterColumn: "items.code",
      sortColumn: "items.code",
      groupable: true,
      aggregates: ["count_distinct"],
      filterOptions: "distinct",
    },
    quantity: {
      label: "Quantity",
      type: "number",
      path: "quantity",
      filterColumn: "quantity",
      sortColumn: "quantity",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    uom: {
      label: "Unit of measure",
      type: "text",
      path: "uom",
      filterColumn: "uom",
      sortColumn: "uom",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    designer_note: {
      label: "Designer note",
      type: "text",
      path: "designer_note",
      groupable: false,
      aggregates: [],
    },
    specified_on: {
      label: "Specified on",
      type: "date",
      path: "created_at",
      filterColumn: "created_at",
      sortColumn: "created_at",
      groupable: false,
      aggregates: [],
    },
  },
};
