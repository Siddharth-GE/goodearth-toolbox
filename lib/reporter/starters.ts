/**
 * The starting points — code constants, not seeded rows.
 *
 * Because a seeded row cannot be corrected under additive-only
 * migrations (0005_remove_catalogue_seed_demo.sql exists because that
 * mistake was already made once); because a starter must change in
 * lockstep with the dataset registry, in the same deploy; and because
 * as constants they are TESTABLE — starters.test.ts asserts every one
 * round-trips through parseReportSpec with ZERO loss, which is the one
 * automated gate that catches a registry change silently gutting a
 * starting point.
 *
 * Starters are READ-ONLY. "Save a copy" inserts a `reports` row, and
 * from then on it is an ordinary saved report.
 *
 * Seven were planned with the founder. **A starter ships with its data
 * set, not before it** — one over a dataset that does not exist yet
 * would fail its own test, and would be a broken tile on the landing
 * page. So this list grows a row per stage:
 *
 *   Site & procurement activity   indent_lines        Stage 5  ✅
 *   Spend vs budget               budget_report_lines Stage 6
 *   Sales & collections           crm_*               Stage 7
 *   Project scorecard             several             Stage 8
 *   Stock & inventory position    stock               Stage 8
 *   Design & delivery progress    selection_lines     Stage 8
 *   Plan vs actual                plan_targets        Stage 10
 *
 * PURE data. Nothing here touches Supabase.
 */

import { parseReportSpec, type ReportSpec } from "./spec";

export type Starter = {
  /**
   * "starter-site-procurement" — stable, and never a `reports.id`.
   *
   * A HYPHEN, not the colon this plan first specified. A starter id is
   * a URL path segment (`/reporter/<id>`), and a colon there survived
   * Next's own routing perfectly in local testing but 404'd on the
   * deployed preview — the platform layer in front of the app treats
   * it as something other than an ordinary character. It is also what
   * stops some chat apps making a shared report link clickable. The id
   * must now survive a URL untouched, and starters.test.ts asserts it.
   */
  id: string;
  name: string;
  /** One line saying what the report answers. Shown on the tile. */
  description: string;
  spec: ReportSpec;
};

/** What marks an id as a starting point rather than a saved report. */
export const STARTER_PREFIX = "starter-";

export function isStarterId(id: string): boolean {
  return id.startsWith(STARTER_PREFIX);
}

/**
 * Raw specs, parsed at module load through the same door untrusted JSON
 * uses. If a registry change ever breaks one, it breaks in the test
 * rather than on the landing page.
 */
const SITE_PROCUREMENT = {
  dataset: "indent_lines",
  columns: ["project", "indent", "item", "quantity", "uom", "status", "requested_on"],
  filters: [],
  groupBy: ["project", "status"],
  // Counts, not a sum of quantity: quantity mixes bags, kilos and
  // loads, so a "total quantity" across items is a number that means
  // nothing. Both counts read the same whatever the unit.
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

// "Spend vs budget" reads the budget side: what approved budgets commit
// us to spend, beside the client value quoted on the same lines, and
// the margin between them in rupees. It is NOT budget-versus-PO-actuals
// — that comparison needs two datasets on one page, which is the
// dashboard-composer product this plan defers. The filter pins it to
// approved budgets so a draft nobody has signed cannot inflate it.
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

// One dataset — milestones — never a join to receipts (the registry
// explains the fan-out). received_amount is the view's own per-rung
// aggregate, so due, received and balance all live on one row.
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
];

/** The raw specs, for the test that proves they parse without loss. */
export const STARTER_SOURCES: Record<string, unknown> = {
  "starter-site-procurement": SITE_PROCUREMENT,
  "starter-spend-vs-budget": SPEND_VS_BUDGET,
  "starter-sales-collections": SALES_COLLECTIONS,
};

/** A starter by id, or null. Never throws on an unknown id. */
export function getStarter(id: string): Starter | null {
  return STARTERS.find((starter) => starter.id === id) ?? null;
}
