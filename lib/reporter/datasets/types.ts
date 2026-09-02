/**
 * The dataset registry — what "any data" actually means.
 *
 * Arbitrary SQL from the browser cannot be made safe here: RLS is this
 * app's entire permission model, and any SQL runner would have to be
 * `security definer` and read past every policy in the schema. So the
 * browser only ever sends registry KEYS, and this file is the whitelist
 * they resolve against. After `parseReportSpec` (spec.ts), every string
 * in a spec is provably a key that exists below.
 *
 * PURE data — no imports, no Supabase. The one file that touches the
 * database is queries.ts.
 *
 * Rules that keep this file honest:
 *
 * - Every `select` is a HAND-AUTHORED constant, never composed at
 *   runtime, and EVERY EMBED NAMES ITS CONSTRAINT
 *   (`items!indent_lines_item_id_fkey`, never a bare `items`). A bare
 *   embed through a table with two FK paths answers HTTP 300 at runtime,
 *   `next build` compiles it happily, and the tests never touch a
 *   database — Client Relations shipped four dead screens this way.
 *   datasets.test.ts enforces the rule with a regex.
 * - Never reach `plots` through `units` — every fact table carries its
 *   own `plot_id`, and `units` has had two FK paths to `plots` since
 *   0029. If a dataset ever embeds plots it writes
 *   `plots!units_plot_id_fkey(...)`.
 * - Where `projectField`'s filter crosses an embed, the embed is
 *   `!inner`, so the predicate pushes down to the parent rows (the
 *   reason is commented at lib/inventory/stock-queries.ts:289).
 * - A field without `filterColumn` can never reach a filter; a field
 *   without `sortColumn` can never be sorted on. Absence is the guard.
 * - FOUNDER, 2026-08-12: **a distinct count counts THINGS, not labels.**
 *   Names repeat legitimately — five different armchairs are all called
 *   "Armchair", and "Villa 6" exists in more than one project — so any
 *   field whose `count_distinct` would otherwise count a repeating name
 *   declares an `identityPath` pointing at the row's internal id. The
 *   column on screen still shows the name; only the counting changes.
 *   Codes are not identity either: they can be blank (the live cement
 *   line has none), so counting codes undercounts. Every future dataset
 *   counting a name-labelled entity has this same trap.
 * - FOUNDER, 2026-08-12: **every filter offers choices, never typing.**
 *   An id-backed field declares a `lookup` (a picker fed from masters);
 *   a categorical text field declares `filterOptions: "distinct"` (a
 *   picker fed from the values actually in the data). A text field with
 *   neither is simply not filterable. `contains` exists for a genuinely
 *   free-text search field; no current field earns it. Dates keep the
 *   date picker and numbers keep a number box — those are not lists.
 *   datasets.test.ts enforces this for every future dataset.
 * - The registry is a display decision, not a boundary. The grant and
 *   RLS are the boundary — a dataset here shows only what the signed-in
 *   user's policies let through.
 * - Chart forms live in the spec (bar/hbar/line/area/stacked/meter).
 *   There is deliberately NO pie and NO donut — part-to-whole is a
 *   stacked bar, a two-slice pie is a meter. Do not add one for variety.
 */

export type FieldType = "text" | "number" | "money" | "date" | "bool";

/**
 * The tables and views a dataset's `source` may name. queries.ts casts
 * through this type to satisfy the typed client's .from() overloads,
 * and datasets.test.ts asserts every dataset's source is listed — so a
 * new dataset that forgets this union fails a test rather than
 * compiling into a runtime 404.
 */
export const KNOWN_SOURCES = [
  "indent_lines",
  "purchase_order_lines",
  "bills",
  "budget_report_lines",
  "crm_milestone_facts",
  "crm_receipt_facts",
  "goods_receipt_lines",
  "stock_by_location",
  "selection_lines",
  "pusher_chain_state",
  "units",
  "business_plan_target_facts",
] as const;
export type KnownSource = (typeof KNOWN_SOURCES)[number];

export const AGGREGATES = ["sum", "avg", "min", "max", "count", "count_distinct"] as const;
export type Aggregate = (typeof AGGREGATES)[number];

export type FieldDef = {
  /** Column heading and picker label. Plain English. */
  label: string;
  type: FieldType;
  /** Dot path into the fetched row, e.g. "indents.projects.name". */
  path: string;
  /**
   * Dot path to what makes a row's value one THING rather than one
   * label — used by `count_distinct` only, and only when `path` is a
   * name that legitimately repeats. Never blank, never shared: an
   * internal id. The display path is untouched, so the screen still
   * shows names. Must appear in the dataset's `select`.
   */
  identityPath?: string;
  /**
   * PostgREST column a filter on this field pushes down to. Dotted for
   * embedded tables ("indents.status"). Absent = never filterable.
   */
  filterColumn?: string;
  /** Present = this field may be sorted on. Absent = never sortable. */
  sortColumn?: string;
  /** May appear in groupBy. */
  groupable: boolean;
  /** Aggregates this field may carry as a measure. Empty = none. */
  aggregates: Aggregate[];
  /**
   * Old keys that still resolve to this field — how a rename stays
   * non-breaking for saved reports. One array entry per rename, ever.
   */
  aliases?: string[];
  /**
   * The filter renders as a bounded picker instead of free text, and its
   * ops are fixed to eq/neq. The picker's options come from queries.ts.
   */
  lookup?: "projects" | "units" | "vendors";
  /**
   * The value is arithmetic over the row's OTHER fields, not a column —
   * a key of DERIVED in derive.ts (a plain string here so this file
   * stays import-free; datasets.test.ts asserts the key exists).
   * Computed by extractRows after flattening. Never filterable or
   * sortable: there is no column to push down to.
   */
  derive?: string;
  /**
   * The filter renders as a picker of the distinct values present in
   * the data (fetched via the dataset's `optionsSelect`), ops eq/neq.
   */
  filterOptions?: "distinct";
};

export type DatasetDef = {
  /** Name on the picker card. */
  label: string;
  /** One sentence saying what one row is. */
  description: string;
  /** The table or view queried. */
  source: string;
  /** Hand-authored select constant. Never composed at runtime. */
  select: string;
  /**
   * Hand-authored select fetching ONLY the columns behind
   * `filterOptions: "distinct"` fields, for the filter dropdowns.
   * Null when the dataset has none.
   */
  optionsSelect: string | null;
  /** Field key whose filter scopes the report to a project, if any. */
  projectField: string | null;
  /**
   * Columns fetchAll pages by, in order. Defaults to ["id"]; a dataset
   * over a view WITHOUT an id column (stock_by_location) must name a
   * combination stable enough to page on, or the first fetch 400s at
   * runtime — which no local gate catches. datasets.test.ts asserts
   * every named column is in the select.
   */
  pageOrder?: string[];
  /**
   * Names a post-fetch enrichment queries.ts performs on the extracted
   * rows — the stock view carries bare ids, and its item and location
   * names come from bounded masters lookups rather than embeds (a view
   * declares no FKs, so PostgREST cannot embed through it).
   */
  enrich?: "stock_names";
  /** Field keys the user may range on — a report picks WHICH date. */
  dateFields: string[];
  /** True once a dataset carries rupees. Gated by its own RLS. */
  money: boolean;
  /** Columns a blank report opens with. */
  defaultColumns: string[];
  /** How a blank report is ordered. */
  defaultSort: { field: string; dir: "asc" | "desc" }[];
  fields: Record<string, FieldDef>;
};
