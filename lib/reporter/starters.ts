// Starters are code constants, not seeded rows: a seeded row can't be corrected under additive-only
// migrations, and starters.test.ts proves each parses with zero loss. Read-only; "Save a copy"
// makes an ordinary saved report. A starter ships with its dataset, never before it. Pure data.

import { parseReportSpec, type ReportSpec } from "./spec";

export type Starter = {
  /**
   * "starter-*": a hyphen, not a colon, which 404s on the deployed platform. Never a `reports.id`.
   */
  id: string;
  name: string;
  description: string;
  spec: ReportSpec;
};

export const STARTER_PREFIX = "starter-";

export function isStarterId(id: string): boolean {
  return id.startsWith(STARTER_PREFIX);
}

// Parsed at module load through the same door untrusted JSON uses, so a registry break fails the
// test, not the landing page.
const SITE_PROCUREMENT = {
  dataset: "indent_lines",
  columns: ["project", "indent", "item", "quantity", "uom", "status", "requested_on"],
  filters: [],
  groupBy: ["project", "status"],
  // Counts, not a sum of quantity: quantity mixes bags, kilos and loads.
  measures: [
    { field: "indent", agg: "count_distinct" },
    { field: "item", agg: "count_distinct" },
  ],
  sort: [{ field: "indent", dir: "desc" }],
  limit: 100,
  chart: {
    type: "bar",
    category: "project",
    measures: ["indent:count_distinct", "item:count_distinct"],
  },
};

// Reads the budget side only; the filter pins approved budgets so an unsigned draft can't inflate
// it.
const SPEND_VS_BUDGET = {
  dataset: "budget_report_lines",
  columns: ["project", "unit", "item", "quantity", "uom", "unit_cost", "client_rate", "margin_pct"],
  filters: [{ field: "budget_status", op: "eq", value: "approved" }],
  groupBy: ["project"],
  measures: [
    { field: "cost_value", agg: "sum" },
    { field: "client_value", agg: "sum" },
    { field: "margin_value", agg: "sum" },
  ],
  sort: [{ field: "cost_value", dir: "desc" }],
  limit: 100,
  chart: {
    type: "bar",
    category: "project",
    measures: ["cost_value:sum", "client_value:sum"],
  },
};

// One dataset, never a join to receipts (it would fan out); received_amount is the view's own
// per-rung aggregate.
const SALES_COLLECTIONS = {
  dataset: "crm_milestones",
  columns: ["project", "unit", "client", "stage", "due_amount", "received_amount", "balance_due", "due_on"], // prettier-ignore
  filters: [],
  groupBy: ["project"],
  measures: [
    { field: "due_amount", agg: "sum" },
    { field: "received_amount", agg: "sum" },
    { field: "balance_due", agg: "sum" },
  ],
  sort: [{ field: "balance_due", dir: "desc" }],
  limit: 100,
  chart: {
    type: "bar",
    category: "project",
    measures: ["due_amount:sum", "received_amount:sum"],
  },
};

// Summed across locations: the same item at two stores is one holding.
const STOCK_POSITION = {
  dataset: "stock",
  columns: ["item", "item_code", "location", "location_kind", "quantity"],
  filters: [],
  groupBy: ["item"],
  measures: [{ field: "quantity", agg: "sum" }],
  sort: [{ field: "quantity", dir: "desc" }],
  limit: 100,
  chart: {
    type: "hbar",
    category: "item",
    measures: ["quantity:sum"],
  },
};

// Single-dataset version: units stacked by status, project by project.
const PROJECT_SCORECARD = {
  dataset: "units",
  columns: ["project", "plot", "unit", "unit_type", "status"],
  filters: [],
  groupBy: ["project", "status"],
  measures: [{ field: "unit", agg: "count_distinct" }],
  sort: [{ field: "unit", dir: "desc" }],
  limit: 100,
  chart: {
    type: "stacked",
    category: "project",
    measures: ["unit:count_distinct"],
  },
};

// Grouped by status alone: distinct counts don't merge across stacked segments (a unit under two
// revisions would double).
const DESIGN_DELIVERY = {
  dataset: "selection_lines",
  columns: ["project", "unit", "revision", "status", "item", "quantity", "uom"],
  filters: [],
  groupBy: ["status"],
  measures: [
    { field: "unit", agg: "count_distinct" },
    { field: "item", agg: "count_distinct" },
  ],
  sort: [{ field: "unit", dir: "desc" }],
  limit: 100,
  chart: {
    type: "bar",
    category: "status",
    measures: ["unit:count_distinct", "item:count_distinct"],
  },
};

// One row per published plan; the actuals are the view's own aggregates, so nothing fans out.
const PLAN_VS_ACTUAL = {
  dataset: "plan_targets",
  columns: ["project", "plan", "scenario", "revenue", "actual_collections", "total_cost", "actual_spend", "pbt"], // prettier-ignore
  filters: [],
  groupBy: ["project"],
  measures: [
    { field: "revenue", agg: "sum" },
    { field: "actual_collections", agg: "sum" },
    { field: "total_cost", agg: "sum" },
    { field: "actual_spend", agg: "sum" },
  ],
  sort: [{ field: "revenue", dir: "desc" }],
  limit: 100,
  chart: {
    type: "bar",
    category: "project",
    measures: ["revenue:sum", "actual_collections:sum", "total_cost:sum", "actual_spend:sum"],
  },
};

export const STARTERS: Starter[] = [
  {
    id: "starter-site-procurement",
    name: "Site & procurement activity",
    description:
      "What site has asked for, project by project, and where each request has got to. Counts indents and items rather than quantities, which mix units.",
    spec: parseReportSpec(SITE_PROCUREMENT),
  },
  {
    id: "starter-spend-vs-budget",
    name: "Spend vs budget",
    description:
      "What each approved budget commits us to spend, project by project, beside the client value quoted on the same lines — and the margin between them.",
    spec: parseReportSpec(SPEND_VS_BUDGET),
  },
  {
    id: "starter-sales-collections",
    name: "Sales & collections",
    description:
      "What clients owe against every payment milestone, what has come in, and the balance still to collect — project by project. Receipts not yet matched to a milestone are in the Client receipts data set.",
    spec: parseReportSpec(SALES_COLLECTIONS),
  },
  {
    id: "starter-stock-position",
    name: "Stock & inventory position",
    description:
      "Every item's balance on hand, biggest holdings first — and where each sits, store by store, site by site.",
    spec: parseReportSpec(STOCK_POSITION),
  },
  {
    id: "starter-project-scorecard",
    name: "Project scorecard",
    description:
      "What stands where: every project's units stacked by sale status, with the plot and type behind each.",
    spec: parseReportSpec(PROJECT_SCORECARD),
  },
  {
    id: "starter-design-delivery",
    name: "Design & delivery progress",
    description:
      "How much of the specified catalogue sits at each design stage — units and distinct items per revision status. Filter to a project to see one site's picture.",
    spec: parseReportSpec(DESIGN_DELIVERY),
  },
  {
    id: "starter-plan-vs-actual",
    name: "Plan vs actual",
    description:
      "Every published business plan's revenue and cost, beside what the project has actually collected and billed so far. A plan publishes when Business Planning links it to a project.",
    spec: parseReportSpec(PLAN_VS_ACTUAL),
  },
];

export const STARTER_SOURCES: Record<string, unknown> = {
  "starter-site-procurement": SITE_PROCUREMENT,
  "starter-spend-vs-budget": SPEND_VS_BUDGET,
  "starter-sales-collections": SALES_COLLECTIONS,
  "starter-stock-position": STOCK_POSITION,
  "starter-project-scorecard": PROJECT_SCORECARD,
  "starter-design-delivery": DESIGN_DELIVERY,
  "starter-plan-vs-actual": PLAN_VS_ACTUAL,
};

export function getStarter(id: string): Starter | null {
  return STARTERS.find((starter) => starter.id === id) ?? null;
}
