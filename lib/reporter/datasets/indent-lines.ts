// ---------------------------------------------------------------------
// indent_lines — every material line ever requested
// ---------------------------------------------------------------------
// The Stage 2 dataset, chosen because indents and indent_lines are
// readable by every authenticated user (0019) — zero RLS risk while the
// whole pipeline is proven. Carries no money by design.

// item_id, project_id and unit_id are selected for their fields'
// identityPath, not for display — a distinct count of items counts ids
// while the column keeps showing names.
import type { DatasetDef } from "./types";

const INDENT_LINES_SELECT =
  "id, item_id, quantity, uom, note, created_at, " +
  "items!indent_lines_item_id_fkey!inner(name, code), " +
  "indents!indent_lines_indent_id_fkey!inner(reference, status, stage, required_by, project_id, unit_id, " +
  "projects!indents_project_id_fkey(name), units!indents_unit_id_fkey(name))";

const INDENT_LINES_OPTIONS_SELECT =
  "uom, items!indent_lines_item_id_fkey!inner(name, code), " +
  "indents!indent_lines_indent_id_fkey!inner(status, stage)";

export const indentLines: DatasetDef = {
  label: "Indent lines",
  description: "Every material line site teams have requested, item by item.",
  source: "indent_lines",
  select: INDENT_LINES_SELECT,
  optionsSelect: INDENT_LINES_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["requested_on", "required_by"],
  money: false,
  defaultColumns: ["project", "indent", "item", "quantity", "uom", "status", "requested_on"],
  defaultSort: [{ field: "requested_on", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "indents.projects.name",
      identityPath: "indents.project_id",
      filterColumn: "indents.project_id",
      sortColumn: "indents.projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      // Unit names repeat across projects — every project has a "Villa
      // 6" — so the count follows the id.
      path: "indents.units.name",
      identityPath: "indents.unit_id",
      // Filters by id on the inner-joined indents row — a name filter
      // would need units!inner, which drops unit-less lines everywhere.
      filterColumn: "indents.unit_id",
      sortColumn: "indents.units.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    // No identityPath: a reference IS the identity — generated, unique,
    // never blank — so counting references counts indents.
    indent: {
      label: "Indent",
      type: "text",
      path: "indents.reference",
      sortColumn: "indents.reference",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    status: {
      label: "Status",
      type: "text",
      path: "indents.status",
      filterColumn: "indents.status",
      sortColumn: "indents.status",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    stage: {
      label: "Stage",
      type: "text",
      path: "indents.stage",
      filterColumn: "indents.stage",
      sortColumn: "indents.stage",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    // Item name and item code are two labels for the same thing, so
    // both count by item_id: five armchairs all named "Armchair" are
    // five items, and an item with no code is still an item.
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
    // A note is prose — a dropdown of whole notes would be nonsense and
    // typing is out by the founder's rule, so it displays but never
    // filters (no filterColumn).
    note: {
      label: "Note",
      type: "text",
      path: "note",
      groupable: false,
      aggregates: [],
    },
    requested_on: {
      label: "Requested on",
      type: "date",
      path: "created_at",
      filterColumn: "created_at",
      sortColumn: "created_at",
      groupable: false,
      aggregates: [],
    },
    required_by: {
      label: "Required by",
      type: "date",
      path: "indents.required_by",
      filterColumn: "indents.required_by",
      sortColumn: "indents.required_by",
      groupable: false,
      aggregates: [],
    },
  },
};
