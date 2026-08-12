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

export const AGGREGATES = ["sum", "avg", "min", "max", "count", "count_distinct"] as const;
export type Aggregate = (typeof AGGREGATES)[number];

export type FieldDef = {
  /** Column heading and picker label. Plain English. */
  label: string;
  type: FieldType;
  /** Dot path into the fetched row, e.g. "indents.projects.name". */
  path: string;
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
  lookup?: "projects" | "units";
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

// ---------------------------------------------------------------------
// indent_lines — every material line ever requested
// ---------------------------------------------------------------------
// The Stage 2 dataset, chosen because indents and indent_lines are
// readable by every authenticated user (0019) — zero RLS risk while the
// whole pipeline is proven. Carries no money by design.

const INDENT_LINES_SELECT =
  "id, quantity, uom, note, created_at, " +
  "items!indent_lines_item_id_fkey!inner(name, code), " +
  "indents!indent_lines_indent_id_fkey!inner(reference, status, stage, required_by, project_id, " +
  "projects!indents_project_id_fkey(name), units!indents_unit_id_fkey(name))";

const INDENT_LINES_OPTIONS_SELECT =
  "uom, items!indent_lines_item_id_fkey!inner(name, code), " +
  "indents!indent_lines_indent_id_fkey!inner(status, stage)";

const indentLines: DatasetDef = {
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
      filterColumn: "indents.project_id",
      sortColumn: "indents.projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "indents.units.name",
      // Filters by id on the inner-joined indents row — a name filter
      // would need units!inner, which drops unit-less lines everywhere.
      filterColumn: "indents.unit_id",
      sortColumn: "indents.units.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
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
    item: {
      label: "Item",
      type: "text",
      path: "items.name",
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
      filterColumn: "items.code",
      sortColumn: "items.code",
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

// ---------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------

export const DATASETS: Record<string, DatasetDef> = {
  indent_lines: indentLines,
};

/** Where a blank or unrecognisable spec lands. */
export const DEFAULT_DATASET = "indent_lines";

/**
 * A field key, or an alias of one, resolved to the current key.
 * Null when it matches nothing — the caller drops it, never throws.
 */
export function resolveFieldKey(dataset: DatasetDef, key: unknown): string | null {
  if (typeof key !== "string" || !key) return null;
  if (Object.prototype.hasOwnProperty.call(dataset.fields, key)) return key;
  for (const [current, field] of Object.entries(dataset.fields)) {
    if (field.aliases?.includes(key)) return current;
  }
  return null;
}
