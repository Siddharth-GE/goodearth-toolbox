/**
 * The plain-English words every part of a report shares — the builder,
 * the table, the chart legend and the CSV headings. Presentation only:
 * the legal ops and aggregates come from the registry via
 * builderDataset(); these are just what they are called on screen.
 *
 * It lives in lib rather than beside the screens because the CSV routes
 * need it too, and a column called one thing on the page and another in
 * the download is the kind of small lie that costs an afternoon.
 */
import type { Aggregate, FieldType } from "./datasets";
import type { Op } from "./spec";

export function opLabel(op: Op, type: FieldType): string {
  if (type === "date") {
    if (op === "gte") return "on or after";
    if (op === "lte") return "on or before";
  }
  switch (op) {
    case "eq":
      return "is";
    case "neq":
      return "is not";
    case "gt":
      return "more than";
    case "gte":
      return "at least";
    case "lt":
      return "less than";
    case "lte":
      return "at most";
    case "contains":
      return "contains";
  }
}

export function aggLabel(agg: Aggregate): string {
  switch (agg) {
    case "sum":
      return "Total";
    case "avg":
      return "Average";
    case "min":
      return "Lowest";
    case "max":
      return "Highest";
    case "count":
      return "Count";
    case "count_distinct":
      return "Distinct count";
  }
}

/** "Total quantity", "Distinct count of items" — a measure column's heading. */
export function measureLabel(fieldLabel: string, agg: Aggregate): string {
  if (agg === "count_distinct") return `Distinct ${fieldLabel.toLowerCase()}s`;
  if (agg === "count") return `${fieldLabel} count`;
  return `${aggLabel(agg)} ${fieldLabel.toLowerCase()}`;
}
