// ---------------------------------------------------------------------
// goods_receipt_lines — every delivery line ever received
// ---------------------------------------------------------------------
// Money-free by design (0022's reasoning: a quantity and a status are
// operational fact, not commercial secret), and readable by every
// authenticated user, so zero RLS risk.

import type { DatasetDef } from "./types";

const GOODS_RECEIPT_LINES_SELECT =
  "id, item_id, quantity, uom, note, created_at, " +
  "items!goods_receipt_lines_item_id_fkey!inner(name, code), " +
  "goods_receipts!goods_receipt_lines_receipt_id_fkey!inner(reference, received_at, to_site, project_id, unit_id, store_id, " +
  "projects!goods_receipts_project_id_fkey(name), units!goods_receipts_unit_id_fkey(name), " +
  "stores!goods_receipts_store_id_fkey(name))";

const GOODS_RECEIPT_LINES_OPTIONS_SELECT =
  "uom, items!goods_receipt_lines_item_id_fkey!inner(name, code)";

export const goodsReceiptLines: DatasetDef = {
  label: "Goods receipt lines",
  description: "Every delivery line ever received, at a store or straight to site.",
  source: "goods_receipt_lines",
  select: GOODS_RECEIPT_LINES_SELECT,
  optionsSelect: GOODS_RECEIPT_LINES_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["received_on"],
  money: false,
  defaultColumns: ["project", "grn", "item", "quantity", "uom", "store", "to_site", "received_on"],
  defaultSort: [{ field: "received_on", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "goods_receipts.projects.name",
      identityPath: "goods_receipts.project_id",
      filterColumn: "goods_receipts.project_id",
      sortColumn: "goods_receipts.projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "goods_receipts.units.name",
      identityPath: "goods_receipts.unit_id",
      filterColumn: "goods_receipts.unit_id",
      sortColumn: "goods_receipts.units.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    grn: {
      label: "GRN",
      type: "text",
      path: "goods_receipts.reference",
      sortColumn: "goods_receipts.reference",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    // Stores are few but have no lookup type and their name sits on a
    // nested left embed (the filter-the-embed trap), so the store
    // displays and groups but does not filter in v1.
    store: {
      label: "Store",
      type: "text",
      path: "goods_receipts.stores.name",
      identityPath: "goods_receipts.store_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    to_site: {
      label: "Straight to site",
      type: "bool",
      path: "goods_receipts.to_site",
      filterColumn: "goods_receipts.to_site",
      groupable: true,
      aggregates: [],
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
    note: {
      label: "Note",
      type: "text",
      path: "note",
      groupable: false,
      aggregates: [],
    },
    received_on: {
      label: "Received on",
      type: "date",
      path: "goods_receipts.received_at",
      filterColumn: "goods_receipts.received_at",
      sortColumn: "goods_receipts.received_at",
      groupable: false,
      aggregates: [],
    },
  },
};
