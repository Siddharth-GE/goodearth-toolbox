// Money-free: what left a store, for where, and for which work. The location-wise issue report (2026-10-22).

import type { DatasetDef } from "./types";

const STOCK_ISSUE_LINES_SELECT =
  "id, item_id, quantity, uom, note, " +
  "items!stock_issue_lines_item_id_fkey!inner(name, code), " +
  "stock_issues!stock_issue_lines_issue_id_fkey!inner(reference, issued_at, project_id, plot_id, store_id, to_store_id, work_item_id, " +
  "projects!stock_issues_project_id_fkey(name), plots!stock_issues_plot_id_fkey(name), " +
  "stores!stock_issues_store_id_fkey(name), to_store:stores!stock_issues_to_store_id_fkey(name), " +
  "work_items!stock_issues_work_item_id_fkey(name, code))";

const STOCK_ISSUE_LINES_OPTIONS_SELECT =
  "uom, items!stock_issue_lines_item_id_fkey!inner(name, code)";

export const stockIssueLines: DatasetDef = {
  label: "Material issued",
  description:
    "Every line issued out of a store: to a villa or site (with the work it was for), or moved to another store.",
  source: "stock_issue_lines",
  select: STOCK_ISSUE_LINES_SELECT,
  optionsSelect: STOCK_ISSUE_LINES_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["issued_on"],
  money: false,
  defaultColumns: [
    "project",
    "issued_to",
    "work",
    "item",
    "quantity",
    "uom",
    "from_store",
    "issued_on",
  ],
  defaultSort: [{ field: "issued_on", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "stock_issues.projects.name",
      identityPath: "stock_issues.project_id",
      filterColumn: "stock_issues.project_id",
      sortColumn: "stock_issues.projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    // Names on nested left embeds display and group but don't filter (the filter-the-embed trap).
    issued_to: {
      label: "Issued to (plot)",
      type: "text",
      path: "stock_issues.plots.name",
      identityPath: "stock_issues.plot_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    to_store: {
      label: "Moved to (store)",
      type: "text",
      path: "stock_issues.to_store.name",
      identityPath: "stock_issues.to_store_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    from_store: {
      label: "From store",
      type: "text",
      path: "stock_issues.stores.name",
      identityPath: "stock_issues.store_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    work: {
      label: "Work",
      type: "text",
      path: "stock_issues.work_items.name",
      identityPath: "stock_issues.work_item_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    work_code: {
      label: "Work code",
      type: "text",
      path: "stock_issues.work_items.code",
      identityPath: "stock_issues.work_item_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    issue: {
      label: "Issue note",
      type: "text",
      path: "stock_issues.reference",
      sortColumn: "stock_issues.reference",
      groupable: true,
      aggregates: ["count_distinct"],
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
    issued_on: {
      label: "Issued on",
      type: "date",
      path: "stock_issues.issued_at",
      filterColumn: "stock_issues.issued_at",
      sortColumn: "stock_issues.issued_at",
      groupable: false,
      aggregates: [],
    },
  },
};
