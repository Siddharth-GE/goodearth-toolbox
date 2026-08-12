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

export const STARTERS: Starter[] = [
  {
    id: "starter-site-procurement",
    name: "Site & procurement activity",
    description:
      "What site has asked for, project by project, and where each request has got to. Counts indents and items rather than quantities, which mix units.",
    spec: parseReportSpec(SITE_PROCUREMENT),
  },
];

/** The raw specs, for the test that proves they parse without loss. */
export const STARTER_SOURCES: Record<string, unknown> = {
  "starter-site-procurement": SITE_PROCUREMENT,
};

/** A starter by id, or null. Never throws on an unknown id. */
export function getStarter(id: string): Starter | null {
  return STARTERS.find((starter) => starter.id === id) ?? null;
}
