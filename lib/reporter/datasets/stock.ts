// ---------------------------------------------------------------------
// stock — what is where, right now
// ---------------------------------------------------------------------
// stock_by_location has NO project_id and NO declared FKs, so it
// registers unscoped (an honest note lives in the description) and its
// names arrive by enrichment, not embed. It also has no id column —
// pageOrder replaces the default. Quantities only, never cost.

import type { DatasetDef } from "./types";

export const stock: DatasetDef = {
  label: "Stock on hand",
  description:
    "What is where right now — every item's balance at each store and site. Not scoped to a project: a store serves several.",
  source: "stock_by_location",
  select: "item_id, location_id, location_kind, quantity",
  optionsSelect: "location_kind",
  projectField: null,
  pageOrder: ["item_id", "location_id"],
  enrich: "stock_names",
  dateFields: [],
  money: false,
  defaultColumns: ["item", "item_code", "location", "location_kind", "quantity"],
  defaultSort: [],
  fields: {
    // Enriched from bounded lookups — display and grouping only. The
    // founder's dropdown rule is satisfied by not being filterable.
    item: {
      label: "Item",
      type: "text",
      path: "item_name",
      identityPath: "item_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    item_code: {
      label: "Item code",
      type: "text",
      path: "item_code",
      identityPath: "item_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    location: {
      label: "Location",
      type: "text",
      path: "location_name",
      identityPath: "location_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    location_kind: {
      label: "Location kind",
      type: "text",
      path: "location_kind",
      filterColumn: "location_kind",
      sortColumn: "location_kind",
      groupable: true,
      aggregates: [],
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
  },
};
