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

// ---------------------------------------------------------------------
// indent_lines — every material line ever requested
// ---------------------------------------------------------------------
// The Stage 2 dataset, chosen because indents and indent_lines are
// readable by every authenticated user (0019) — zero RLS risk while the
// whole pipeline is proven. Carries no money by design.

// item_id, project_id and unit_id are selected for their fields'
// identityPath, not for display — a distinct count of items counts ids
// while the column keeps showing names.
const INDENT_LINES_SELECT =
  "id, item_id, quantity, uom, note, created_at, " +
  "items!indent_lines_item_id_fkey!inner(name, code), " +
  "indents!indent_lines_indent_id_fkey!inner(reference, status, stage, required_by, project_id, unit_id, " +
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
      identityPath: "indents.project_id",
      filterColumn: "indents.project_id",
      sortColumn: "indents.projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      // Unit names repeat across projects — every project has a "Villa
      // 6" — so the count follows the id.
      path: "indents.units.name",
      identityPath: "indents.unit_id",
      // Filters by id on the inner-joined indents row — a name filter
      // would need units!inner, which drops unit-less lines everywhere.
      filterColumn: "indents.unit_id",
      sortColumn: "indents.units.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    // No identityPath: a reference IS the identity — generated, unique,
    // never blank — so counting references counts indents.
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
    // Item name and item code are two labels for the same thing, so
    // both count by item_id: five armchairs all named "Armchair" are
    // five items, and an item with no code is still an item.
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
// po_lines — every purchase-order line, with its rate and value
// ---------------------------------------------------------------------
// MONEY, by the founder's decision (PLAN.md decisions 3 and 4; policies
// widened by 0055). Every PO has a vendor (checked in production before
// this shipped), so the vendors embed could be !inner — but it is not
// needed: the vendor FILTER pushes down on purchase_orders.vendor_id,
// and the embed only supplies the display name.

const PO_LINES_SELECT =
  "id, item_id, quantity, uom, rate, gst_pct, note, created_at, " +
  "items!purchase_order_lines_item_id_fkey!inner(name, code), " +
  "purchase_orders!purchase_order_lines_po_id_fkey!inner(reference, status, project_id, unit_id, vendor_id, issued_at, expected_by, " +
  "projects!purchase_orders_project_id_fkey(name), units!purchase_orders_unit_id_fkey(name), " +
  "vendors!purchase_orders_vendor_id_fkey(name))";

const PO_LINES_OPTIONS_SELECT =
  "uom, items!purchase_order_lines_item_id_fkey!inner(name, code), " +
  "purchase_orders!purchase_order_lines_po_id_fkey!inner(status)";

const poLines: DatasetDef = {
  label: "Purchase order lines",
  description: "Every line ever ordered from a vendor, with its rate and value.",
  source: "purchase_order_lines",
  select: PO_LINES_SELECT,
  optionsSelect: PO_LINES_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["ordered_on", "expected_by"],
  money: true,
  defaultColumns: ["project", "po", "vendor", "item", "quantity", "uom", "rate", "line_value", "status", "ordered_on"], // prettier-ignore
  defaultSort: [{ field: "ordered_on", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "purchase_orders.projects.name",
      identityPath: "purchase_orders.project_id",
      filterColumn: "purchase_orders.project_id",
      sortColumn: "purchase_orders.projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "purchase_orders.units.name",
      identityPath: "purchase_orders.unit_id",
      filterColumn: "purchase_orders.unit_id",
      sortColumn: "purchase_orders.units.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    vendor: {
      label: "Vendor",
      type: "text",
      path: "purchase_orders.vendors.name",
      identityPath: "purchase_orders.vendor_id",
      // By id, not name: a filter on the nested vendors embed would
      // filter the EMBED, not the parent rows, and silently return
      // every line. The id column sits on the inner-joined PO row.
      filterColumn: "purchase_orders.vendor_id",
      sortColumn: "purchase_orders.vendors.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "vendors",
    },
    // A reference is generated, unique, never blank — its own identity.
    po: {
      label: "PO",
      type: "text",
      path: "purchase_orders.reference",
      sortColumn: "purchase_orders.reference",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    status: {
      label: "Status",
      type: "text",
      path: "purchase_orders.status",
      filterColumn: "purchase_orders.status",
      sortColumn: "purchase_orders.status",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
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
    rate: {
      label: "Rate",
      type: "money",
      path: "rate",
      filterColumn: "rate",
      sortColumn: "rate",
      groupable: false,
      aggregates: ["avg", "min", "max", "count"],
    },
    gst_pct: {
      label: "GST %",
      type: "number",
      path: "gst_pct",
      filterColumn: "gst_pct",
      sortColumn: "gst_pct",
      groupable: false,
      aggregates: ["avg", "min", "max"],
    },
    line_value: {
      label: "Line value",
      type: "money",
      path: "line_value",
      derive: "po_line_value",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    note: {
      label: "Note",
      type: "text",
      path: "note",
      groupable: false,
      aggregates: [],
    },
    ordered_on: {
      label: "Ordered on",
      type: "date",
      path: "created_at",
      filterColumn: "created_at",
      sortColumn: "created_at",
      groupable: false,
      aggregates: [],
    },
    expected_by: {
      label: "Expected by",
      type: "date",
      path: "purchase_orders.expected_by",
      filterColumn: "purchase_orders.expected_by",
      sortColumn: "purchase_orders.expected_by",
      groupable: false,
      aggregates: [],
    },
  },
};

// ---------------------------------------------------------------------
// bills — every bill recorded, header level
// ---------------------------------------------------------------------
// A bill has no lines by design (the paper invoice's figures are the
// record), so this dataset IS the billed money. No purchase_orders
// embed on purpose: bills.po_id resolves to three relations and nothing
// here needs it.

const BILLS_SELECT =
  "id, bill_no, reference, invoice_no, invoice_date, taxable_amount, gst_amount, total_amount, " +
  "status, kind, project_id, unit_id, vendor_id, created_at, paid_at, " +
  "projects!bills_project_id_fkey(name), units!bills_unit_id_fkey(name), " +
  "vendors!bills_vendor_id_fkey(name)";

const BILLS_OPTIONS_SELECT = "status, kind";

const bills: DatasetDef = {
  label: "Bills",
  description: "Every vendor and labour bill recorded, with its amounts and payment state.",
  source: "bills",
  select: BILLS_SELECT,
  optionsSelect: BILLS_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["invoice_date", "paid_on", "recorded_on"],
  money: true,
  defaultColumns: ["project", "vendor", "bill_no", "kind", "status", "total_amount", "invoice_date"], // prettier-ignore
  defaultSort: [{ field: "recorded_on", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "projects.name",
      identityPath: "project_id",
      filterColumn: "project_id",
      sortColumn: "projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "units.name",
      identityPath: "unit_id",
      filterColumn: "unit_id",
      sortColumn: "units.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    vendor: {
      label: "Vendor",
      type: "text",
      path: "vendors.name",
      identityPath: "vendor_id",
      filterColumn: "vendor_id",
      sortColumn: "vendors.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "vendors",
    },
    bill_no: {
      label: "Bill",
      type: "text",
      path: "bill_no",
      sortColumn: "bill_no",
      groupable: false,
      aggregates: ["count_distinct"],
    },
    invoice_no: {
      label: "Invoice no.",
      type: "text",
      path: "invoice_no",
      groupable: false,
      aggregates: [],
    },
    kind: {
      label: "Kind",
      type: "text",
      path: "kind",
      filterColumn: "kind",
      sortColumn: "kind",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    status: {
      label: "Status",
      type: "text",
      path: "status",
      filterColumn: "status",
      sortColumn: "status",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    taxable_amount: {
      label: "Taxable amount",
      type: "money",
      path: "taxable_amount",
      filterColumn: "taxable_amount",
      sortColumn: "taxable_amount",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    gst_amount: {
      label: "GST amount",
      type: "money",
      path: "gst_amount",
      filterColumn: "gst_amount",
      sortColumn: "gst_amount",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    total_amount: {
      label: "Total amount",
      type: "money",
      path: "total_amount",
      filterColumn: "total_amount",
      sortColumn: "total_amount",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    invoice_date: {
      label: "Invoice date",
      type: "date",
      path: "invoice_date",
      filterColumn: "invoice_date",
      sortColumn: "invoice_date",
      groupable: false,
      aggregates: [],
    },
    paid_on: {
      label: "Paid on",
      type: "date",
      path: "paid_at",
      filterColumn: "paid_at",
      sortColumn: "paid_at",
      groupable: false,
      aggregates: [],
    },
    recorded_on: {
      label: "Recorded on",
      type: "date",
      path: "created_at",
      filterColumn: "created_at",
      sortColumn: "created_at",
      groupable: false,
      aggregates: [],
    },
  },
};

// ---------------------------------------------------------------------
// budget_report_lines — priced budget lines, including margin
// ---------------------------------------------------------------------
// Reads the 0055 view of the same name: flat columns, no embeds, no
// chance of the ambiguous-embed trap. The view is security_invoker, so
// this dataset sees exactly what the signed-in user's widened policies
// allow — margin included, per the founder's explicit reversal of
// 0011's margin boundary.

const BUDGET_LINES_SELECT =
  "id, quantity, uom, unit_cost, margin_pct, client_rate, line_status, needs_review, " +
  "priced_at, approved_at, budget_status, version, unit_id, unit_name, project_id, " +
  "project_name, item_id, item_name, item_code, expected_vendor_id, vendor_name";

const BUDGET_LINES_OPTIONS_SELECT = "line_status, budget_status, uom, item_name, item_code";

const budgetReportLines: DatasetDef = {
  label: "Budget lines",
  description: "Every priced budget line — cost, client rate, and the margin between them.",
  source: "budget_report_lines",
  select: BUDGET_LINES_SELECT,
  optionsSelect: BUDGET_LINES_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["priced_on", "approved_on"],
  money: true,
  defaultColumns: ["project", "unit", "item", "quantity", "uom", "unit_cost", "margin_pct", "client_rate", "line_status"], // prettier-ignore
  defaultSort: [{ field: "priced_on", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "project_name",
      identityPath: "project_id",
      filterColumn: "project_id",
      sortColumn: "project_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "unit_name",
      identityPath: "unit_id",
      filterColumn: "unit_id",
      sortColumn: "unit_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    item: {
      label: "Item",
      type: "text",
      path: "item_name",
      identityPath: "item_id",
      filterColumn: "item_name",
      sortColumn: "item_name",
      groupable: true,
      aggregates: ["count_distinct"],
      filterOptions: "distinct",
    },
    item_code: {
      label: "Item code",
      type: "text",
      path: "item_code",
      identityPath: "item_id",
      filterColumn: "item_code",
      sortColumn: "item_code",
      groupable: true,
      aggregates: ["count_distinct"],
      filterOptions: "distinct",
    },
    vendor: {
      label: "Expected vendor",
      type: "text",
      path: "vendor_name",
      identityPath: "expected_vendor_id",
      filterColumn: "expected_vendor_id",
      sortColumn: "vendor_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "vendors",
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
    unit_cost: {
      label: "Unit cost",
      type: "money",
      path: "unit_cost",
      filterColumn: "unit_cost",
      sortColumn: "unit_cost",
      groupable: false,
      aggregates: ["avg", "min", "max", "count"],
    },
    margin_pct: {
      label: "Margin %",
      type: "number",
      path: "margin_pct",
      filterColumn: "margin_pct",
      sortColumn: "margin_pct",
      groupable: false,
      aggregates: ["avg", "min", "max"],
    },
    client_rate: {
      label: "Client rate",
      type: "money",
      path: "client_rate",
      filterColumn: "client_rate",
      sortColumn: "client_rate",
      groupable: false,
      aggregates: ["avg", "min", "max", "count"],
    },
    cost_value: {
      label: "Cost value",
      type: "money",
      path: "cost_value",
      derive: "budget_cost_value",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    client_value: {
      label: "Client value",
      type: "money",
      path: "client_value",
      derive: "budget_client_value",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    margin_value: {
      label: "Margin value",
      type: "money",
      path: "margin_value",
      derive: "budget_margin_value",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    line_status: {
      label: "Line status",
      type: "text",
      path: "line_status",
      filterColumn: "line_status",
      sortColumn: "line_status",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    budget_status: {
      label: "Budget status",
      type: "text",
      path: "budget_status",
      filterColumn: "budget_status",
      sortColumn: "budget_status",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    needs_review: {
      label: "Needs review",
      type: "bool",
      path: "needs_review",
      filterColumn: "needs_review",
      groupable: true,
      aggregates: [],
    },
    version: {
      label: "Budget version",
      type: "number",
      path: "version",
      filterColumn: "version",
      sortColumn: "version",
      groupable: true,
      aggregates: ["max", "count"],
    },
    priced_on: {
      label: "Priced on",
      type: "date",
      path: "priced_at",
      filterColumn: "priced_at",
      sortColumn: "priced_at",
      groupable: false,
      aggregates: [],
    },
    approved_on: {
      label: "Approved on",
      type: "date",
      path: "approved_at",
      filterColumn: "approved_at",
      sortColumn: "approved_at",
      groupable: false,
      aggregates: [],
    },
  },
};

// ---------------------------------------------------------------------
// crm_milestones + crm_receipts — the money coming IN (0056)
// ---------------------------------------------------------------------
// TWO DATASETS, NEVER ONE JOIN. A milestone with three receipts fans
// out to three rows in a join, and any sum(due_amount) then triples —
// the easiest way for Reporter to produce a confidently wrong number.
// The one sanctioned crossing is the AGGREGATE the view computes:
// a milestone carries the SUM of its own receipts (received_amount),
// one row per milestone, no fan-out possible. A receipt not yet
// allocated to a milestone appears only in crm_receipts — so "total
// received" belongs there; received_amount answers "how much of THIS
// due is in". Both read 0056's flat views: no embeds, no ambiguity,
// and the prose columns (details, notes, bottlenecks) never left the
// database.

const CRM_MILESTONES_SELECT =
  "id, engagement_id, project_id, unit_id, project_name, unit_name, client_id, client_name, " +
  "stage, sort_order, due_amount, due_on, invoice_no, invoiced_on, received_amount, created_at";

const CRM_MILESTONES_OPTIONS_SELECT = "stage, client_name";

const crmMilestones: DatasetDef = {
  label: "Client payment milestones",
  description:
    "Every rung of every villa's payment schedule — what is due, and how much of it is in.",
  source: "crm_milestone_facts",
  select: CRM_MILESTONES_SELECT,
  optionsSelect: CRM_MILESTONES_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["due_on", "invoiced_on"],
  money: true,
  defaultColumns: ["project", "unit", "client", "stage", "due_amount", "received_amount", "balance_due", "due_on"], // prettier-ignore
  defaultSort: [{ field: "due_on", dir: "asc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "project_name",
      identityPath: "project_id",
      filterColumn: "project_id",
      sortColumn: "project_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "unit_name",
      identityPath: "unit_id",
      filterColumn: "unit_id",
      sortColumn: "unit_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    // Client names can repeat like any names; the id is the identity.
    client: {
      label: "Client",
      type: "text",
      path: "client_name",
      identityPath: "client_id",
      filterColumn: "client_name",
      sortColumn: "client_name",
      groupable: true,
      aggregates: ["count_distinct"],
      filterOptions: "distinct",
    },
    stage: {
      label: "Stage",
      type: "text",
      path: "stage",
      filterColumn: "stage",
      sortColumn: "sort_order",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    due_amount: {
      label: "Due amount",
      type: "money",
      path: "due_amount",
      filterColumn: "due_amount",
      sortColumn: "due_amount",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    received_amount: {
      label: "Received against it",
      type: "money",
      path: "received_amount",
      filterColumn: "received_amount",
      sortColumn: "received_amount",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    balance_due: {
      label: "Balance due",
      type: "money",
      path: "balance_due",
      derive: "crm_balance_due",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    invoice_no: {
      label: "Invoice no.",
      type: "text",
      path: "invoice_no",
      groupable: false,
      aggregates: [],
    },
    due_on: {
      label: "Due on",
      type: "date",
      path: "due_on",
      filterColumn: "due_on",
      sortColumn: "due_on",
      groupable: false,
      aggregates: [],
    },
    invoiced_on: {
      label: "Invoiced on",
      type: "date",
      path: "invoiced_on",
      filterColumn: "invoiced_on",
      sortColumn: "invoiced_on",
      groupable: false,
      aggregates: [],
    },
  },
};

const CRM_RECEIPTS_SELECT =
  "id, engagement_id, project_id, unit_id, project_name, unit_name, client_id, client_name, " +
  "milestone_id, milestone_stage, amount, received_on, mode, reference, created_at";

const CRM_RECEIPTS_OPTIONS_SELECT = "milestone_stage, mode, client_name";

const crmReceipts: DatasetDef = {
  label: "Client receipts",
  description: "Every rupee received from a client, receipt by receipt.",
  source: "crm_receipt_facts",
  select: CRM_RECEIPTS_SELECT,
  optionsSelect: CRM_RECEIPTS_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["received_on"],
  money: true,
  defaultColumns: ["project", "unit", "client", "amount", "mode", "milestone_stage", "received_on"], // prettier-ignore
  defaultSort: [{ field: "received_on", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "project_name",
      identityPath: "project_id",
      filterColumn: "project_id",
      sortColumn: "project_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "unit_name",
      identityPath: "unit_id",
      filterColumn: "unit_id",
      sortColumn: "unit_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    client: {
      label: "Client",
      type: "text",
      path: "client_name",
      identityPath: "client_id",
      filterColumn: "client_name",
      sortColumn: "client_name",
      groupable: true,
      aggregates: ["count_distinct"],
      filterOptions: "distinct",
    },
    amount: {
      label: "Amount",
      type: "money",
      path: "amount",
      filterColumn: "amount",
      sortColumn: "amount",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    mode: {
      label: "Mode",
      type: "text",
      path: "mode",
      filterColumn: "mode",
      sortColumn: "mode",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    // Blank when the receipt is not yet allocated to a rung — an
    // honest gap, not a mistake.
    milestone_stage: {
      label: "Against stage",
      type: "text",
      path: "milestone_stage",
      filterColumn: "milestone_stage",
      sortColumn: "milestone_stage",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    reference: {
      label: "Reference",
      type: "text",
      path: "reference",
      groupable: false,
      aggregates: [],
    },
    received_on: {
      label: "Received on",
      type: "date",
      path: "received_on",
      filterColumn: "received_on",
      sortColumn: "received_on",
      groupable: false,
      aggregates: [],
    },
  },
};

// ---------------------------------------------------------------------
// goods_receipt_lines — every delivery line ever received
// ---------------------------------------------------------------------
// Money-free by design (0022's reasoning: a quantity and a status are
// operational fact, not commercial secret), and readable by every
// authenticated user, so zero RLS risk.

const GOODS_RECEIPT_LINES_SELECT =
  "id, item_id, quantity, uom, note, created_at, " +
  "items!goods_receipt_lines_item_id_fkey!inner(name, code), " +
  "goods_receipts!goods_receipt_lines_receipt_id_fkey!inner(reference, received_at, to_site, project_id, unit_id, store_id, " +
  "projects!goods_receipts_project_id_fkey(name), units!goods_receipts_unit_id_fkey(name), " +
  "stores!goods_receipts_store_id_fkey(name))";

const GOODS_RECEIPT_LINES_OPTIONS_SELECT =
  "uom, items!goods_receipt_lines_item_id_fkey!inner(name, code)";

const goodsReceiptLines: DatasetDef = {
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

// ---------------------------------------------------------------------
// stock — what is where, right now
// ---------------------------------------------------------------------
// stock_by_location has NO project_id and NO declared FKs, so it
// registers unscoped (an honest note lives in the description) and its
// names arrive by enrichment, not embed. It also has no id column —
// pageOrder replaces the default. Quantities only, never cost.

const stock: DatasetDef = {
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

// ---------------------------------------------------------------------
// selection_lines — what design has specified
// ---------------------------------------------------------------------
// Money-free: indicative_rate_snapshot exists on the table and is
// DELIBERATELY not a field here — this dataset is about what was
// specified, not what it costs; budget_report_lines carries the money.
// The selections embed names the COMPOSITE FK (selection_id, unit_id).

const SELECTION_LINES_SELECT =
  "id, item_id, quantity, uom, designer_note, created_at, " +
  "items!selection_lines_item_id_fkey(name, code), " +
  "selections!selection_lines_selection_id_unit_id_fkey!inner(revision_no, status, unit_id, " +
  "units!selections_unit_id_fkey!inner(name, project_id, projects!units_project_id_fkey(name)))";

const SELECTION_LINES_OPTIONS_SELECT =
  "uom, items!selection_lines_item_id_fkey(name, code), " +
  "selections!selection_lines_selection_id_unit_id_fkey!inner(status)";

const selectionLines: DatasetDef = {
  label: "Selection lines",
  description: "Every line design has specified, unit by unit, revision by revision.",
  source: "selection_lines",
  select: SELECTION_LINES_SELECT,
  optionsSelect: SELECTION_LINES_OPTIONS_SELECT,
  projectField: "project",
  dateFields: ["specified_on"],
  money: false,
  defaultColumns: ["project", "unit", "revision", "status", "item", "quantity", "uom"],
  defaultSort: [{ field: "specified_on", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "selections.units.projects.name",
      identityPath: "selections.units.project_id",
      filterColumn: "selections.units.project_id",
      sortColumn: "selections.units.projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "selections.units.name",
      identityPath: "selections.unit_id",
      filterColumn: "selections.unit_id",
      sortColumn: "selections.units.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    revision: {
      label: "Revision",
      type: "number",
      path: "selections.revision_no",
      filterColumn: "selections.revision_no",
      sortColumn: "selections.revision_no",
      groupable: true,
      aggregates: ["max"],
    },
    status: {
      label: "Revision status",
      type: "text",
      path: "selections.status",
      filterColumn: "selections.status",
      sortColumn: "selections.status",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
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
    designer_note: {
      label: "Designer note",
      type: "text",
      path: "designer_note",
      groupable: false,
      aggregates: [],
    },
    specified_on: {
      label: "Specified on",
      type: "date",
      path: "created_at",
      filterColumn: "created_at",
      sortColumn: "created_at",
      groupable: false,
      aggregates: [],
    },
  },
};

// ---------------------------------------------------------------------
// relay_chains — every trail and where its baton is
// ---------------------------------------------------------------------
// Reads pusher_chain_state — Reporter is now that view's THIRD consumer
// (Relay, Client Relations, Reporter); a sixth redefinition must check
// here too (CLAUDE.md's warning). The view is flat and already carries
// its names. department_names is an array, which extractRows cannot
// flatten — it stays out until someone actually asks for it.

const RELAY_CHAINS_SELECT =
  "chain_id, title, project_id, project_name, unit_id, unit_name, trail_set_name, " +
  "activity_name, current_leg, leg_count, days_in_leg, expected_days, " +
  "is_stuck, is_queued, is_finished, started_at, entered_at";

const RELAY_CHAINS_OPTIONS_SELECT = "trail_set_name, activity_name";

const relayChains: DatasetDef = {
  label: "Relay trails",
  description: "Every trail and where its baton is — the current activity, and for how long.",
  source: "pusher_chain_state",
  select: RELAY_CHAINS_SELECT,
  optionsSelect: RELAY_CHAINS_OPTIONS_SELECT,
  projectField: "project",
  pageOrder: ["chain_id"],
  dateFields: ["started_on", "entered_on"],
  money: false,
  defaultColumns: ["project", "trail", "activity", "current_leg", "days_in_leg", "expected_days", "stuck"], // prettier-ignore
  defaultSort: [{ field: "days_in_leg", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "project_name",
      identityPath: "project_id",
      filterColumn: "project_id",
      sortColumn: "project_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "unit_name",
      identityPath: "unit_id",
      filterColumn: "unit_id",
      sortColumn: "unit_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "units",
    },
    trail: {
      label: "Trail",
      type: "text",
      path: "title",
      identityPath: "chain_id",
      sortColumn: "title",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    trail_set: {
      label: "Trail type",
      type: "text",
      path: "trail_set_name",
      filterColumn: "trail_set_name",
      sortColumn: "trail_set_name",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    activity: {
      label: "Current activity",
      type: "text",
      path: "activity_name",
      filterColumn: "activity_name",
      sortColumn: "activity_name",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    current_leg: {
      label: "Leg",
      type: "number",
      path: "current_leg",
      filterColumn: "current_leg",
      sortColumn: "current_leg",
      groupable: false,
      aggregates: ["avg", "min", "max"],
    },
    leg_count: {
      label: "Legs in trail",
      type: "number",
      path: "leg_count",
      filterColumn: "leg_count",
      sortColumn: "leg_count",
      groupable: false,
      aggregates: ["avg", "min", "max"],
    },
    days_in_leg: {
      label: "Days on this leg",
      type: "number",
      path: "days_in_leg",
      filterColumn: "days_in_leg",
      sortColumn: "days_in_leg",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    expected_days: {
      label: "Expected days",
      type: "number",
      path: "expected_days",
      filterColumn: "expected_days",
      sortColumn: "expected_days",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    stuck: {
      label: "Stuck",
      type: "bool",
      path: "is_stuck",
      filterColumn: "is_stuck",
      groupable: true,
      aggregates: [],
    },
    queued: {
      label: "Waiting to start",
      type: "bool",
      path: "is_queued",
      filterColumn: "is_queued",
      groupable: true,
      aggregates: [],
    },
    finished: {
      label: "Finished",
      type: "bool",
      path: "is_finished",
      filterColumn: "is_finished",
      groupable: true,
      aggregates: [],
    },
    started_on: {
      label: "Started on",
      type: "date",
      path: "started_at",
      filterColumn: "started_at",
      sortColumn: "started_at",
      groupable: false,
      aggregates: [],
    },
    entered_on: {
      label: "On this leg since",
      type: "date",
      path: "entered_at",
      filterColumn: "entered_at",
      sortColumn: "entered_at",
      groupable: false,
      aggregates: [],
    },
  },
};

// ---------------------------------------------------------------------
// units — what stands where
// ---------------------------------------------------------------------
// The one dataset that touches plots, and it does so by the book:
// plots!units_plot_id_fkey, never a bare embed — units has had two FK
// paths to plots since 0029.

const UNITS_SELECT =
  "id, name, code, unit_type, status, project_id, plot_id, created_at, " +
  "projects!units_project_id_fkey(name), plots!units_plot_id_fkey(name)";

const UNITS_OPTIONS_SELECT = "unit_type, status";

const units: DatasetDef = {
  label: "Units",
  description: "Every villa and plot-holding, with its type and sale status.",
  source: "units",
  select: UNITS_SELECT,
  optionsSelect: UNITS_OPTIONS_SELECT,
  projectField: "project",
  dateFields: [],
  money: false,
  defaultColumns: ["project", "plot", "unit", "unit_type", "status"],
  defaultSort: [{ field: "unit", dir: "asc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "projects.name",
      identityPath: "project_id",
      filterColumn: "project_id",
      sortColumn: "projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    plot: {
      label: "Plot",
      type: "text",
      path: "plots.name",
      identityPath: "plot_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "name",
      identityPath: "id",
      sortColumn: "name",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    code: {
      label: "Code",
      type: "text",
      path: "code",
      sortColumn: "code",
      groupable: false,
      aggregates: [],
    },
    unit_type: {
      label: "Type",
      type: "text",
      path: "unit_type",
      filterColumn: "unit_type",
      sortColumn: "unit_type",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    status: {
      label: "Status",
      type: "text",
      path: "status",
      filterColumn: "status",
      sortColumn: "status",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
  },
};

// ---------------------------------------------------------------------
// plan_targets — a plan's published numbers beside the project's actuals
// ---------------------------------------------------------------------
// Reads 0057's view: one row per plan a founder has LINKED to a project
// (an unlinked plan publishes nothing). The actuals are the view's own
// per-project aggregates — billed spend and client collections — so no
// report ever joins plan rows to bill or receipt rows. Money, gated by
// the view's WHERE: /business-planning or /reporter.

const PLAN_TARGETS_SELECT =
  "id, plan_id, plan_name, scenario_name, project_id, project_name, revenue, total_cost, " +
  "pbt, margin_pct, peak_funding, actual_spend, actual_collections, published_at";

const planTargets: DatasetDef = {
  label: "Plan targets",
  description:
    "Every published business plan's headline numbers, beside what the project has actually billed and collected so far.",
  source: "business_plan_target_facts",
  select: PLAN_TARGETS_SELECT,
  optionsSelect: "scenario_name",
  projectField: "project",
  dateFields: ["published_on"],
  money: true,
  defaultColumns: ["project", "plan", "scenario", "revenue", "actual_collections", "total_cost", "actual_spend", "pbt"], // prettier-ignore
  defaultSort: [{ field: "revenue", dir: "desc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "project_name",
      identityPath: "project_id",
      filterColumn: "project_id",
      sortColumn: "project_name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    plan: {
      label: "Plan",
      type: "text",
      path: "plan_name",
      identityPath: "plan_id",
      sortColumn: "plan_name",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    scenario: {
      label: "Scenario",
      type: "text",
      path: "scenario_name",
      filterColumn: "scenario_name",
      sortColumn: "scenario_name",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    revenue: {
      label: "Planned revenue",
      type: "money",
      path: "revenue",
      filterColumn: "revenue",
      sortColumn: "revenue",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    total_cost: {
      label: "Planned cost",
      type: "money",
      path: "total_cost",
      filterColumn: "total_cost",
      sortColumn: "total_cost",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    pbt: {
      label: "Planned profit",
      type: "money",
      path: "pbt",
      filterColumn: "pbt",
      sortColumn: "pbt",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max", "count"],
    },
    margin_pct: {
      label: "Planned margin %",
      type: "number",
      path: "margin_pct",
      filterColumn: "margin_pct",
      sortColumn: "margin_pct",
      groupable: false,
      aggregates: ["avg", "min", "max"],
    },
    peak_funding: {
      label: "Peak funding",
      type: "money",
      path: "peak_funding",
      filterColumn: "peak_funding",
      sortColumn: "peak_funding",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    actual_spend: {
      label: "Actual billed spend",
      type: "money",
      path: "actual_spend",
      filterColumn: "actual_spend",
      sortColumn: "actual_spend",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    actual_collections: {
      label: "Actual collections",
      type: "money",
      path: "actual_collections",
      filterColumn: "actual_collections",
      sortColumn: "actual_collections",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    published_on: {
      label: "Published on",
      type: "date",
      path: "published_at",
      filterColumn: "published_at",
      sortColumn: "published_at",
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
  po_lines: poLines,
  bills,
  budget_report_lines: budgetReportLines,
  crm_milestones: crmMilestones,
  crm_receipts: crmReceipts,
  goods_receipt_lines: goodsReceiptLines,
  stock,
  selection_lines: selectionLines,
  relay_chains: relayChains,
  units,
  plan_targets: planTargets,
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
