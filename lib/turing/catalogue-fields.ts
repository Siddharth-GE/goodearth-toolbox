/**
 * What Turing may propose, kind by kind: each a tool's own save, its fields, and how a row is
 * checked before the admin sees it and again when they press Save. Pure. Each tool's entries are
 * `entries/<tool>.ts` and its runners, which call the tool's actions, `runners/<tool>.ts`.
 */

import { BILLS } from "./entries/bills";
import { BUSINESS_PLANNING } from "./entries/business-planning";
import { BIRDWING } from "./entries/birdwing";
import { BIRDWING_BOOKS } from "./entries/birdwing-books";
import { CLIENT_RELATIONS } from "./entries/client-relations";
import { DESIGN_MANAGEMENT } from "./entries/design-management";
import { DIRECTORY } from "./entries/directory";
import { SELECTIONS_BUDGETS } from "./entries/selections-budgets";
import { ESTIMATOR_RATES } from "./entries/estimator-rates";
import { ESTIMATOR_ESTIMATES } from "./entries/estimator-estimates";
import { INDENTS } from "./entries/indents";
import { INVENTORY } from "./entries/inventory";
import { PURCHASE_ORDERS } from "./entries/purchase-orders";
import { MASTERS } from "./entries/masters";
import { MONEY } from "./entries/money";
import { CASH_REQUESTS } from "./entries/cash-requests";
import { RELAY } from "./entries/relay";
import { REPORTER_DEXTER } from "./entries/reporter-dexter";
import { SAARANG_COLLECTIONS } from "./entries/saarang-collections";
import { SUPERVISORS } from "./entries/supervisors";
import { SUPERVISORS_SITE } from "./entries/supervisors-site";
import { WORK_ORDERS } from "./entries/work-orders";

export type FieldKind = "id" | "date" | "whole" | "amount" | "text" | "choice" | "yesno";

/** Where an id points; the server turns each into a name the admin can check. */
export type IdTable =
  | "plots"
  | "work_groups"
  | "work_items"
  | "profiles"
  | "vendors"
  | "labour_logs"
  | "items"
  | "brands"
  | "item_categories"
  | "clients"
  | "companies"
  | "projects"
  | "units"
  | "stores"
  | "document_terms"
  | "uoms"
  | "construction_stages"
  | "progress_stages"
  | "work_categories"
  | "indents"
  | "indent_lines"
  | "purchase_orders"
  | "purchase_order_lines"
  | "goods_receipts"
  | "goods_receipt_lines"
  | "stock_issues"
  | "issue_requests"
  | "labour_contracts"
  | "labour_contract_lines"
  | "work_order_templates"
  | "bills"
  | "bill_lines"
  | "client_actions"
  | "client_payment_milestones"
  | "client_receipts"
  | "birdwing_stays"
  | "birdwing_guests"
  | "birdwing_stay_rooms"
  | "birdwing_stay_charges"
  | "birdwing_invoices"
  | "birdwing_receipts"
  | "birdwing_cross_charges"
  | "birdwing_rate_card"
  | "birdwing_cost_centres"
  | "birdwing_expenses"
  | "birdwing_expense_heads"
  | "birdwing_staff"
  | "birdwing_pay_rules"
  | "design_stages"
  | "design_actions"
  | "drawing_sets"
  | "transmittals"
  | "selections"
  | "selection_lines"
  | "spaces"
  | "space_types"
  | "space_views"
  | "budgets"
  | "estimator_mixes"
  | "estimator_work_components"
  | "estimator_mix_components"
  | "estimator_estimates"
  | "estimator_estimate_lines"
  | "estimator_estimate_line_measurements"
  | "pusher_chains"
  | "pusher_activities"
  | "pusher_departments"
  | "pusher_trail_sets"
  | "project_stages"
  | "staff_departments"
  | "checklist_templates"
  | "checklist_template_items"
  | "site_checklists"
  | "site_checklist_items"
  | "stock_issue_lines"
  | "bill_payments"
  | "contractor_advances"
  | "advance_recoveries"
  | "funding_facilities"
  | "funding_movements"
  | "cash_requests"
  | "cash_request_items"
  | "item_requests"
  | "business_plans"
  | "reports"
  | "dexter_projects"
  | "dexter_decks"
  | "saarang_collection_excluded_receipts"
  | "saarang_collection_corrections"
  | "saarang_collection_extra_units";

const FROM: Record<IdTable, string> = {
  plots: "plots (the villa's plot)",
  work_groups: "work_groups (a stage of the site sequence; a group in the works list)",
  work_items: "work_items (a work in the works list)",
  profiles: "profiles (a person)",
  vendors: "vendors (a vendor or contractor)",
  labour_logs: "labour_logs (a day's labour on a villa)",
  items: "items (a catalogue item or material)",
  brands: "brands",
  item_categories: "item_categories",
  clients: "clients",
  companies: "companies (our own companies)",
  projects: "projects",
  units: "units (a villa or apartment on a plot)",
  stores: "stores",
  document_terms: "document_terms (a terms template)",
  uoms: "uoms (a unit of measure)",
  construction_stages: "construction_stages",
  progress_stages: "progress_stages (a build stage)",
  work_categories: "work_categories",
  indents: "indents (a site's request for materials)",
  indent_lines: "indent_lines (one item on an indent)",
  purchase_orders: "purchase_orders (a PO to one vendor)",
  purchase_order_lines: "purchase_order_lines (one item on a PO)",
  goods_receipts: "goods_receipts (a delivery received against a PO)",
  goods_receipt_lines: "goods_receipt_lines (one item on a delivery)",
  stock_issues: "stock_issues (stock sent from a store to a villa or another store)",
  issue_requests: "issue_requests (a supervisor's request for material from a store)",
  labour_contracts: "labour_contracts (a work order to a contractor)",
  labour_contract_lines: "labour_contract_lines (one work on a work order)",
  work_order_templates: "work_order_templates",
  bills: "bills (a supplier's or contractor's bill)",
  bill_lines: "bill_lines (one line on a bill)",
  client_actions: "client_actions (an action in Client Relations)",
  client_payment_milestones: "client_payment_milestones (one stage of a plot's payment schedule)",
  client_receipts: "client_receipts (money a client paid)",
  birdwing_stays: "birdwing_stays (a stay or room block at Birdwing)",
  birdwing_guests: "birdwing_guests (a Birdwing guest)",
  birdwing_stay_rooms: "birdwing_stay_rooms (a room on a stay, for some nights)",
  birdwing_stay_charges: "birdwing_stay_charges (one charge on a stay)",
  birdwing_invoices: "birdwing_invoices (a stay's invoice)",
  birdwing_receipts: "birdwing_receipts (money received for a stay)",
  birdwing_cross_charges: "birdwing_cross_charges (a stay's cross-charge or write-off)",
  birdwing_rate_card: "birdwing_rate_card (a head of Birdwing's rate card)",
  birdwing_cost_centres: "birdwing_cost_centres (who carries a Goodearth stay)",
  birdwing_expenses: "birdwing_expenses (one of Birdwing's expense lines)",
  birdwing_expense_heads: "birdwing_expense_heads (a head Birdwing's expenses are kept under)",
  birdwing_staff: "birdwing_staff (a member of Birdwing's staff)",
  birdwing_pay_rules: "birdwing_pay_rules (a staff member's pay from a day)",
  design_stages: "design_stages (a stage of Design Management's list)",
  design_actions: "design_actions (an action for the design team)",
  drawing_sets: "drawing_sets (a named set of drawings of one design stage)",
  transmittals: "transmittals (drawings sent to site, or a draft of them)",
  selections: "selections (a numbered design revision of a unit: R0, R1…)",
  selection_lines: "selection_lines (one item specified into a space on a revision)",
  spaces: "spaces (a room or area of a unit)",
  space_types: "space_types (a kind of space: Living, Bedroom, Bath)",
  space_views: "space_views (a photo on a space)",
  budgets: "budgets (the pricing of an issued revision)",
  estimator_mixes: "estimator_mixes (a named mix: M20 concrete)",
  estimator_work_components: "estimator_work_components (a material or mix in a work's recipe)",
  estimator_mix_components: "estimator_mix_components (a material in a mix)",
  estimator_estimates:
    "estimator_estimates (a villa's estimate: working, official, superseded or withdrawn)",
  estimator_estimate_lines:
    "estimator_estimate_lines (a row of a work on an estimate; a work may have several, told apart by label)",
  estimator_estimate_line_measurements:
    "estimator_estimate_line_measurements (a row of a work's measurement sheet)",
  pusher_chains: "pusher_chain_state.chain_id (a Relay trail)",
  pusher_activities: "pusher_activities (an activity a Relay trail's legs are made of)",
  pusher_departments: "pusher_departments (a department Relay trails are tagged with)",
  pusher_trail_sets: "pusher_trail_sets (a Relay trail type)",
  project_stages: "project_stages (a stage of a project's Relay schedule)",
  staff_departments: "staff_departments (a department people sit in, in Directory)",
  checklist_templates: "checklist_templates (a site checklist's template)",
  checklist_template_items: "checklist_template_items (one check of a checklist template)",
  site_checklists: "site_checklists (a checklist started on a villa)",
  site_checklist_items: "site_checklist_items (one check of a villa's checklist, with its answer)",
  stock_issue_lines: "stock_issue_lines (one item on an issue from a store)",
  bill_payments: "bill_payments (money paid against a bill, or its reversal)",
  contractor_advances: "contractor_advances (an advance paid to a contractor or supplier)",
  advance_recoveries: "advance_recoveries (part of a bill settled from an advance)",
  funding_facilities: "funding_facilities (a bank loan, private equity or private debt)",
  funding_movements: "funding_movements (money drawn, repaid or paid as interest on a facility)",
  cash_requests: "cash_requests (a week's request for money to pay bills and advances)",
  cash_request_items: "cash_request_items (a bill or advance on a cash request)",
  item_requests:
    "item_requests (a designer's item the catalogue lacked, already in use as a provisional item)",
  business_plans: "business_plans (a business plan)",
  reports: "reports (a saved Reporter report)",
  dexter_projects: "dexter_projects (a Dexter project: a folder of pitch decks)",
  dexter_decks: "dexter_decks (a Dexter deck: an uploaded pitch with a client link)",
  saarang_collection_excluded_receipts:
    "saarang_collection_excluded_receipts (a Zoho receipt left out of the Saarang figures)",
  saarang_collection_corrections:
    "saarang_collection_corrections (an amount added to or taken off a Saarang unit's milestone)",
  saarang_collection_extra_units:
    "saarang_collection_extra_units (a sold Saarang unit added because Zoho is missing it)",
};

export type Field = {
  key: string;
  label: string;
  kind: FieldKind;
  /**
   * May be left out or empty. Left out keeps what is there now; empty clears it (or goes back to
   * the default), as the tool's own screen does.
   */
  optional?: true;
  /** Optional, but only ever left out: the tool refuses it empty, so it is refused here first. */
  keep?: true;
  choices?: readonly string[];
  /** A choice as the admin reads it, where its stored word is not plain English. */
  labels?: Record<string, string>;
  /** What an empty choice means, where it is not "none". */
  blank?: string;
  table?: IdTable;
  /** The record a change or delete is about: never sent in the tool's form, never edited on screen. */
  record?: true;
  /** On a new record, what a field left out starts as, as the tool's own form starts it. */
  start?: Value;
  /** On an entry with lines: the record's own field, the same on each of its lines. */
  header?: true;
  /** Longest text taken; 500 unless said. */
  max?: number;
  /** An amount that may be below zero (a stock count corrected down). */
  signed?: true;
  /** An amount to six decimals, not three: a recipe's 0.0144 cum of mortar per sqm. */
  fine?: true;
  /** Rupees: above zero, to the paise, up to ₹999 crore — what is shown is what the money action stores. */
  paise?: true;
  /** A business plan's number, which its editor takes as typed: up to ₹99,999 crore, six decimals. */
  wide?: true;
  /** A day's head count: up to 999, two decimals (0.5 for half a day), as labour_logs holds it. */
  heads?: true;
};

/**
 * A save that reads a form: the function in `file` that reads it (a reader or the action itself).
 * Every name it reads is a field of the entry or listed as `ignored` by this save, which a test
 * holds, so a renamed or added form field fails CI instead of saving blank.
 */
export type FormSource = {
  file: string;
  reader: string;
  ignored?: readonly string[];
  /** What a ticked box sends: the masters' toggles "1" (the default), a plain checkbox "on". */
  ticked?: "on";
};

/** Where a new record may already be, so a row that looks like one is flagged; each a column of the table and a field of the row. */
export type Alike = {
  table: IdTable;
  tax?: string;
  phone?: string;
  code?: string;
};

export type Entry<K extends string = string> = {
  key: K;
  /** The tool whose save this is; its grant is checked by its own action. */
  tool: string;
  title: string;
  description: string;
  fields: Field[];
  /** Makes a new record, so a field left out is blank (or its `start`) rather than kept. */
  adds?: true;
  /** A rule across a row's fields, beyond each field's own. */
  check?: (values: Record<string, Value>) => string | undefined;
  form?: FormSource;
  alike?: Alike;
  /** A record with lines: one row per line, its `header` fields saying which record (`recordsOf`); `noun` names one ("Indent"). */
  lines?: { noun: string };
  /** Said on the proposal card, above Save: what the admin must know before pressing it. */
  warning?: string;
};

export type Value = string | boolean;
/** A field missing from `values` was left out: keep what is there. */
export type Row = { label: string; values: Record<string, Value> };

export const ENTRIES = [
  ...SUPERVISORS,
  ...MASTERS,
  ...INDENTS,
  ...PURCHASE_ORDERS,
  ...INVENTORY,
  ...WORK_ORDERS,
  ...BILLS,
  ...CLIENT_RELATIONS,
  ...BIRDWING,
  ...BIRDWING_BOOKS,
  ...DESIGN_MANAGEMENT,
  ...SELECTIONS_BUDGETS,
  ...ESTIMATOR_RATES,
  ...ESTIMATOR_ESTIMATES,
  ...RELAY,
  ...DIRECTORY,
  ...SUPERVISORS_SITE,
  ...MONEY,
  ...CASH_REQUESTS,
  ...BUSINESS_PLANNING,
  ...REPORTER_DEXTER,
  ...SAARANG_COLLECTIONS,
];
export type EntryKey = (typeof ENTRIES)[number]["key"];

export const entryFor = (key: unknown): Entry<EntryKey> | undefined =>
  ENTRIES.find((entry) => entry.key === key);

/** The fields a save's form carries: every field but the record it is about. */
export const formKeys = (entry: Entry) =>
  entry.fields.filter((field) => !field.record).map((field) => field.key);

/**
 * The form as the tool's own screen sends it. A field left out of a change is sent as it is now,
 * since the tool's update replaces every field; a ticked box sends what its form's does ("1" unless
 * said) and an unticked one nothing.
 */
export function formOf(
  entry: Entry,
  values: Record<string, Value>,
  now?: Record<string, unknown>,
): FormData {
  const form = new FormData();
  for (const field of entry.fields) {
    if (field.record) continue;
    const value = field.key in values ? values[field.key] : now?.[field.key];
    if (field.kind === "yesno") {
      if (value === true) form.set(field.key, entry.form?.ticked ?? "1");
      continue;
    }
    form.set(field.key, value === null || value === undefined ? "" : String(value));
  }
  return form;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A real calendar day, written 2026-10-24: 2026-02-30 is refused, not rolled into March. */
const isDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** `undefined` back means the field was left out. */
function checkValue(field: Field, raw: unknown): Checked<Value | undefined> {
  if (raw === undefined) {
    return field.optional
      ? { ok: true, value: undefined }
      : { ok: false, error: `${field.label} is missing.` };
  }
  if (field.kind === "yesno") {
    return typeof raw === "boolean"
      ? { ok: true, value: raw }
      : { ok: false, error: `${field.label} is yes or no.` };
  }
  const text = raw === null ? "" : typeof raw === "number" ? String(raw) : raw;
  if (typeof text !== "string") return { ok: false, error: `${field.label} is not readable.` };
  const value = text.trim();
  if (!value) {
    if (field.keep)
      return { ok: false, error: `${field.label} can be left as it is, but not emptied.` };
    return field.optional
      ? { ok: true, value: "" }
      : { ok: false, error: `${field.label} is missing.` };
  }
  switch (field.kind) {
    case "id":
      return UUID.test(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is not an id.` };
    case "date":
      return isDay(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is a real date written 2026-10-24.` };
    case "whole":
      return /^\d{1,3}$/.test(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is a whole number up to 999.` };
    case "amount":
      if (field.paise)
        return /^\d{1,10}(\.\d{1,2})?$/.test(value) && Number(value) > 0
          ? { ok: true, value }
          : {
              ok: false,
              error: `${field.label} is rupees above zero, to the paise, like 25000.50.`,
            };
      if (field.heads)
        return /^\d{1,3}(\.\d{1,2})?$/.test(value)
          ? { ok: true, value }
          : { ok: false, error: `${field.label} is a head count up to 999, like 2 or 0.5.` };
      return (field.signed
        ? /^-?\d{1,9}(\.\d{1,3})?$/
        : field.fine
          ? /^\d{1,9}(\.\d{1,6})?$/
          : field.wide
            ? /^\d{1,12}(\.\d{1,6})?$/
            : /^\d{1,9}(\.\d{1,3})?$/
      ).test(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is a number, like 12.5.` };
    case "choice":
      return field.choices?.includes(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is one of: ${field.choices?.join(", ")}.` };
    case "text":
      return value.length <= (field.max ?? 500)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is too long.` };
  }
}

export function checkRow(entry: Entry, raw: unknown): Checked<Row> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "A row is an object." };
  }
  const given = raw as Record<string, unknown>;
  const source = (
    typeof given.values === "object" && given.values !== null ? given.values : given
  ) as Record<string, unknown>;
  const label = typeof given.label === "string" ? given.label.trim() : "";
  if (!label || label.length > 160)
    return { ok: false, error: "Each row needs a label saying what it changes." };
  const values: Record<string, Value> = {};
  for (const field of entry.fields) {
    const value = checkValue(field, source[field.key]);
    if (!value.ok) return value;
    if (value.value !== undefined) values[field.key] = value.value;
    else if (entry.adds && field.start !== undefined) values[field.key] = field.start;
  }
  const problem = entry.check?.(values);
  if (problem) return { ok: false, error: problem };
  return { ok: true, value: { label, values } };
}

export type Proposal = { entry: Entry; title: string; rows: Row[] };

/** Claude's proposal, checked whole: every row must pass, or Claude is told which did not. */
export function checkProposal(input: unknown): Checked<Proposal> {
  const given = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const entry = entryFor(given.action);
  if (!entry) return { ok: false, error: `There is no change called "${String(given.action)}".` };
  const title = typeof given.title === "string" ? given.title.trim() : "";
  if (!title || title.length > 120)
    return { ok: false, error: "A proposal needs a title of up to 120 characters." };
  if (!Array.isArray(given.rows) || given.rows.length === 0 || given.rows.length > 200) {
    return { ok: false, error: "A proposal has 1 to 200 rows." };
  }
  const rows: Row[] = [];
  const problems: string[] = [];
  given.rows.forEach((raw, index) => {
    const row = checkRow(entry, raw);
    if (row.ok) rows.push(row.value);
    else problems.push(`Row ${index + 1}: ${row.error}`);
  });
  if (problems.length > 0) return { ok: false, error: problems.slice(0, 20).join("\n") };
  return { ok: true, value: { entry, title, rows } };
}

/**
 * The rows the admin saves: the ones they ticked, as they edited them. What a row is about and
 * who or what it names — its ids — cannot be edited on screen, so an edit to one is refused.
 */
export function editedRows(
  entry: Entry,
  original: Row[],
  edits: unknown,
): Checked<{ index: number; row: Row }[]> {
  if (!Array.isArray(edits) || edits.length === 0)
    return { ok: false, error: "Tick at least one row." };
  const seen = new Set<number>();
  const rows: { index: number; row: Row }[] = [];
  for (const edit of edits) {
    const index = (edit as { row?: unknown })?.row;
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      !original[index] ||
      seen.has(index)
    ) {
      return { ok: false, error: "The rows changed. Reload and try again." };
    }
    seen.add(index);
    const changes = ((edit as { values?: object }).values ?? {}) as Record<string, unknown>;
    const merged = {
      label: original[index].label,
      values: { ...original[index].values, ...changes } as Record<string, unknown>,
    };
    // null is the admin's "Keep as is": the field is left out, whatever Turing proposed.
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) delete merged.values[key];
    }
    const row = checkRow(entry, merged);
    if (!row.ok) return { ok: false, error: `${original[index].label}: ${row.error}` };
    const moved = entry.fields.find(
      (field) =>
        field.kind === "id" && row.value.values[field.key] !== original[index].values[field.key],
    );
    if (moved)
      return {
        ok: false,
        error: `${original[index].label}: its ${moved.label.toLowerCase()} cannot change.`,
      };
    rows.push({ index, row: row.value });
  }
  return { ok: true, value: rows.sort((a, b) => a.index - b.index) };
}

/** Which record a line belongs to: its header fields, together; left out and empty are the same. */
export const recordKey = (entry: Entry, values: Record<string, Value | null>) =>
  JSON.stringify(
    entry.fields
      .filter((field) => field.header)
      .map((field) => (values[field.key] === "" ? null : (values[field.key] ?? null))),
  );

/**
 * An entry with lines, as records: the lines Turing proposed with the same header are one record
 * (one indent, one PO), in the order each first appears. The grouping is fixed by the proposal, so
 * the admin's edits can neither merge two records nor split one: a record whose lines were saved
 * with different headers is refused.
 */
export function recordsOf<T extends { index: number; row: Row }>(
  entry: Entry,
  proposed: Row[],
  rows: T[],
): Checked<{ header: Record<string, Value>; rows: T[] }[]> {
  const header = entry.fields.filter((field) => field.header);
  const records = new Map<string, { header: Record<string, Value>; rows: T[] }>();
  for (const item of rows) {
    const key = recordKey(entry, proposed[item.index]?.values ?? item.row.values);
    const record = records.get(key);
    if (record) {
      if (recordKey(entry, record.rows[0].row.values) !== recordKey(entry, item.row.values)) {
        return {
          ok: false,
          error: `${item.row.label}: the lines of one ${entry.lines?.noun.toLowerCase() ?? "record"} must share its ${header.map((field) => field.label.toLowerCase()).join(", ")}.`,
        };
      }
      record.rows.push(item);
      continue;
    }
    records.set(key, {
      header: Object.fromEntries(
        header
          .filter((field) => field.key in item.row.values)
          .map((field) => [field.key, item.row.values[field.key]]),
      ),
      rows: [item],
    });
  }
  return { ok: true, value: [...records.values()] };
}

/** Every id the rows name, by the table it points into, for the server to turn into names. */
export function idsOf(entry: Entry, rows: Row[]): Map<IdTable, Set<string>> {
  const ids = new Map<IdTable, Set<string>>();
  for (const field of entry.fields) {
    if (field.kind !== "id" || !field.table) continue;
    for (const row of rows) {
      const value = row.values[field.key];
      if (typeof value !== "string" || !value) continue;
      if (!ids.has(field.table)) ids.set(field.table, new Set());
      ids.get(field.table)?.add(value);
    }
  }
  return ids;
}

/** The catalogue as Claude reads it, in the system prompt: stable text, so the cache holds. */
export function catalogueText(): string {
  const rows = ENTRIES.map((entry) => {
    const fields = entry.fields
      .map((field) => {
        const kind =
          field.kind === "choice"
            ? `one of ${field.choices?.join(" | ")}`
            : field.kind === "id"
              ? `id from ${field.table ? FROM[field.table] : "its table"}`
              : field.kind === "yesno"
                ? "true or false"
                : field.kind === "whole"
                  ? "whole number"
                  : field.kind === "amount"
                    ? field.signed
                      ? "number, below 0 to take away"
                      : field.paise
                        ? "rupees above 0, at most 2 decimals"
                        : field.heads
                          ? "head count, 0.5 for half a day"
                          : "number"
                    : field.kind;
        const starts =
          entry.adds && field.start !== undefined ? `, ${String(field.start)} if left out` : "";
        const may = field.keep
          ? ", optional, never empty"
          : field.optional
            ? `, optional${starts}`
            : "";
        return `${field.key} (${kind}${may})`;
      })
      .join(", ");
    const adds = entry.adds ? " Adds a new record." : "";
    const lines = entry.lines
      ? ` One row per line; rows with the same ${entry.fields
          .filter((field) => field.header)
          .map((field) => field.key)
          .join(", ")} make one record, so give those the same on each of its lines.`
      : "";
    return `- ${entry.key} — ${entry.title}, in ${entry.tool}.${adds}${lines} ${entry.description} Fields: ${fields}.`;
  });
  return [
    "An optional field left out keeps what is there now; given as empty it clears it. On an entry that adds a new record, a field left out is blank. Give only what the admin asked to change. Every id is shown to the admin as a name, and an id that names nothing is refused.",
    ...rows,
  ].join("\n");
}
