// The browser only ever sends registry KEYS and this file is the whitelist: any SQL runner would be
// security definer and read past every policy. Pure data; only queries.ts touches the database.
// - Every `select` is hand-authored. EVERY EMBED NAMES ITS CONSTRAINT
//   (`items!indent_lines_item_id_fkey`): a bare embed through two FK paths answers HTTP 300 at
//   runtime while the build passes (BUGCATCHER #2). datasets.test.ts enforces it.
// - Reach `plots` through each fact table's own plot_id, never `units` (two FK paths since 0029).
// - A projectField filter crossing an embed uses `!inner` (lib/inventory/stock-queries.ts:289).
// - No `filterColumn` means never filterable; no `sortColumn` means never sortable.
// - A distinct count counts THINGS, not labels: names repeat and codes can be blank, so such fields
//   declare an `identityPath` to the internal id.
// - Every filter offers choices, never typing: `lookup` for id-backed fields, `filterOptions:
//   "distinct"` for categorical text, else not filterable (datasets.test.ts enforces it).
// - The registry is a display decision; the grant and RLS are the boundary.
// - No pie or donut chart: part-to-whole is a stacked bar, a two-slice pie is a meter.

export type FieldType = "text" | "number" | "money" | "date" | "bool";

// queries.ts casts through this type for .from(); datasets.test.ts asserts every source is listed.
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
  "birdwing_stay_facts",
  "birdwing_expense_facts",
] as const;
export type KnownSource = (typeof KNOWN_SOURCES)[number];

export const AGGREGATES = ["sum", "avg", "min", "max", "count", "count_distinct"] as const;
export type Aggregate = (typeof AGGREGATES)[number];

export type FieldDef = {
  label: string;
  type: FieldType;
  path: string;
  /**
   * Dot path to what makes a row one THING, for count_distinct only; an internal id, never blank or
   * shared. Must be in `select`.
   */
  identityPath?: string;
  /** PostgREST column a filter pushes down to; dotted for embeds. */
  filterColumn?: string;
  sortColumn?: string;
  groupable: boolean;
  aggregates: Aggregate[];
  /** Old keys that still resolve here, so a rename doesn't break saved reports. */
  aliases?: string[];
  /** Bounded picker, ops fixed to eq/neq; options come from queries.ts. */
  lookup?: "projects" | "units" | "vendors";
  /**
   * Arithmetic over the row's other fields, not a column: a key of DERIVED in derive.ts (a string
   * here to stay import-free). Never filterable or sortable.
   */
  derive?: string;
  /** Picker of the distinct values in the data (via `optionsSelect`), ops eq/neq. */
  filterOptions?: "distinct";
};

export type DatasetDef = {
  label: string;
  description: string;
  source: string;
  select: string;
  /** Select for ONLY the `filterOptions: "distinct"` columns; null when none. */
  optionsSelect: string | null;
  projectField: string | null;
  /**
   * Columns fetchAll pages by, default ["id"]. A view without an id column must name a stable
   * combination, or the first fetch 400s at runtime.
   */
  pageOrder?: string[];
  /** Post-fetch enrichment in queries.ts: a view carries bare ids and can't embed names. */
  enrich?: "stock_names";
  dateFields: string[];
  money: boolean;
  defaultColumns: string[];
  defaultSort: { field: string; dir: "asc" | "desc" }[];
  fields: Record<string, FieldDef>;
};
