// ---------------------------------------------------------------------
// po_lines — every purchase-order line, with its rate and value
// ---------------------------------------------------------------------
// MONEY, by the founder's decision (PLAN.md decisions 3 and 4; policies
// widened by 0055). Every PO has a vendor (checked in production before
// this shipped), so the vendors embed could be !inner — but it is not
// needed: the vendor FILTER pushes down on purchase_orders.vendor_id,
// and the embed only supplies the display name.

import type { DatasetDef } from "./types";

const PO_LINES_SELECT =
  "id, item_id, quantity, uom, rate, gst_pct, note, created_at, " +
  "items!purchase_order_lines_item_id_fkey!inner(name, code), " +
  "purchase_orders!purchase_order_lines_po_id_fkey!inner(reference, status, project_id, unit_id, vendor_id, issued_at, expected_by, " +
  "projects!purchase_orders_project_id_fkey(name), units!purchase_orders_unit_id_fkey(name), " +
  "vendors!purchase_orders_vendor_id_fkey(name))";

const PO_LINES_OPTIONS_SELECT =
  "uom, items!purchase_order_lines_item_id_fkey!inner(name, code), " +
  "purchase_orders!purchase_order_lines_po_id_fkey!inner(status)";

export const poLines: DatasetDef = {
  label: "Purchase order lines",
  description: "Every line ever ordered from a vendor, with its rate and value.",
  source: "purchase_order_lines",
  select: PO_LINES_SELECT,
  optionsSelect: PO_LINES_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["ordered_on", "expected_by"],
  money: true,
  defaultColumns: ["project", "po", "vendor", "item", "quantity", "uom", "rate", "line_value", "status", "ordered_on"], // prettier-ignore
  defaultSort: [{ field: "ordered_on", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "purchase_orders.projects.name",
      identityPath: "purchase_orders.project_id",
      filterColumn: "purchase_orders.project_id",
      sortColumn: "purchase_orders.projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "purchase_orders.units.name",
      identityPath: "purchase_orders.unit_id",
      filterColumn: "purchase_orders.unit_id",
      sortColumn: "purchase_orders.units.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    vendor: {
      label: "Vendor",
      type: "text",
      path: "purchase_orders.vendors.name",
      identityPath: "purchase_orders.vendor_id",
      // By id, not name: a filter on the nested vendors embed would
      // filter the EMBED, not the parent rows, and silently return
      // every line. The id column sits on the inner-joined PO row.
      filterColumn: "purchase_orders.vendor_id",
      sortColumn: "purchase_orders.vendors.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "vendors",
    },
    // A reference is generated, unique, never blank — its own identity.
    po: {
      label: "PO",
      type: "text",
      path: "purchase_orders.reference",
      sortColumn: "purchase_orders.reference",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    status: {
      label: "Status",
      type: "text",
      path: "purchase_orders.status",
      filterColumn: "purchase_orders.status",
      sortColumn: "purchase_orders.status",
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
    rate: {
      label: "Rate",
      type: "money",
      path: "rate",
      filterColumn: "rate",
      sortColumn: "rate",
      groupable: false,
      aggregates: ["avg", "min", "max", "count"],
    },
    gst_pct: {
      label: "GST %",
      type: "number",
      path: "gst_pct",
      filterColumn: "gst_pct",
      sortColumn: "gst_pct",
      groupable: false,
      aggregates: ["avg", "min", "max"],
    },
    line_value: {
      label: "Line value",
      type: "money",
      path: "line_value",
      derive: "po_line_value",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    note: {
      label: "Note",
      type: "text",
      path: "note",
      groupable: false,
      aggregates: [],
    },
    ordered_on: {
      label: "Ordered on",
      type: "date",
      path: "created_at",
      filterColumn: "created_at",
      sortColumn: "created_at",
      groupable: false,
      aggregates: [],
    },
    expected_by: {
      label: "Expected by",
      type: "date",
      path: "purchase_orders.expected_by",
      filterColumn: "purchase_orders.expected_by",
      sortColumn: "purchase_orders.expected_by",
      groupable: false,
      aggregates: [],
    },
  },
};
