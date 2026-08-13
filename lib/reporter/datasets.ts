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
// The registry
// ---------------------------------------------------------------------

export const DATASETS: Record<string, DatasetDef> = {
  indent_lines: indentLines,
  po_lines: poLines,
  bills,
  budget_report_lines: budgetReportLines,
  crm_milestones: crmMilestones,
  crm_receipts: crmReceipts,
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
