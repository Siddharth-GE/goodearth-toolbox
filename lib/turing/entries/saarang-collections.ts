/** Saarang Collections: the figures typed by hand, the collection period, the rules and their three lists. Uploads stay on its Reports screen. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

const TOOL = "/saarang-collections";
const FILE = "lib/saarang-collections/actions.ts";

const PROJECT_LABELS = { plot: "Saarang Plot", villa: "Saarang Villa", phase3: "Phase 3" };
const FIGURE_LABELS: Record<string, string> = {
  C: "C, total project value (E)",
  D: "D, total expense value (E)",
  E: "E, total sold value",
  F: "F, total collection",
  G: "G, total expense",
  H: "H, last month's collection",
  I: "I, last month's expense",
  J: "J, next month's collection (E)",
  K: "K, next month's expense (E)",
  M: "M, collection receivables (outstanding)",
  MTD: "MTD, this month's collection so far",
  N: "N, total units",
  O: "O, total sold",
  P: "P, invoice value",
  Q: "Q, invoices to be raised",
  R: "R, invoice value to be raised",
  T: "T, next month's collection target",
};

// 0161's saarang_collection_figures_key_known; the tool's own save refuses any other cell too.
const TYPED: Record<string, readonly string[]> = {
  plot: ["C", "D", "G", "I", "J", "K", "N", "Q", "R", "T"],
  villa: ["C", "D", "G", "I", "J", "K", "N", "Q", "R", "T"],
  phase3: ["C", "E", "N", "O", "P", "F", "M", "H", "MTD", "T"],
};

const unit: Field = { key: "unit", label: "Unit", kind: "text", max: 60 };
const note: Field = { key: "note", label: "Note", kind: "text", optional: true, max: 500 };
const rupees = (key: string, label: string, optional = false): Field => ({
  key,
  label,
  kind: "amount",
  wide: true,
  ...(optional ? { optional: true as const } : {}),
});

const anyOf =
  (keys: string[], ask: string) =>
  (values: Record<string, Value>): string | undefined =>
    keys.some((key) => key in values) ? undefined : ask;

const zohoUnit = (values: Record<string, Value>) =>
  /^SAARANG-(PLOT|VILLA)-/i.test(String(values.unit ?? ""))
    ? undefined
    : "The unit is written as Zoho has it, like SAARANG-PLOT-07.";

export const SAARANG_COLLECTIONS = defineEntries([
  {
    key: "saarang_figure",
    tool: TOOL,
    title: "A Saarang figure typed by hand",
    description:
      "One shaded cell of the Saarang meeting summary, kept in saarang_collection_figures. Saarang Plot and Saarang Villa type C, D, G, I, J, K, N, Q, R and T; Phase 3 types its whole row: C, E, N, O, P, F, M, H, MTD and T. N, O and Q are counts; the rest are rupees. Empty clears the cell. Every other figure is worked out from the Zoho uploads and cannot be typed: read it from saarang_collection_summary (Plot and Villa only), where L is collected but unused, S is OL-collection, O and Munits are counts, and a null value means that Zoho report is not uploaded. If that table is empty, or its computed_at is older than the newest saarang_collection_uploads.uploaded_at or saarang_collection_settings.updated_at, say the figures may be out of date: any save in the tool rewrites them.",
    check: (values) =>
      !("value" in values)
        ? "Say the figure, or send it empty to clear the cell."
        : TYPED[String(values.project)]?.includes(String(values.figure))
          ? undefined
          : "That figure is worked out from Zoho for that project, not typed.",
    fields: [
      {
        key: "project",
        label: "Project",
        kind: "choice",
        choices: ["plot", "villa", "phase3"],
        labels: PROJECT_LABELS,
      },
      {
        key: "figure",
        label: "Figure",
        kind: "choice",
        choices: Object.keys(FIGURE_LABELS),
        labels: FIGURE_LABELS,
      },
      rupees("value", "Value", true),
    ],
  },
  {
    key: "saarang_period",
    tool: TOOL,
    title: "The Saarang collection period",
    description:
      "The days 'last month's collection' counts receipts between, both included. Uploading newer reports resets it to the calendar month before the report date.",
    form: { file: FILE, reader: "savePeriod" },
    check: (values) =>
      String(values.period_to) < String(values.period_from)
        ? "The period ends before it starts."
        : undefined,
    fields: [
      { key: "period_from", label: "From", kind: "date" },
      { key: "period_to", label: "To", kind: "date" },
    ],
  },
  {
    key: "saarang_rules",
    tool: TOOL,
    title: "The Saarang rules, changed",
    description:
      "How the figures are worked out: the ending that marks a test unit (blank: none), whether stale duplicate schedules are dropped, the GST % added to Plot's and Villa's milestone values, and whether a unit's sold value is its price or its price with GST ('incl'). A rule left out stays as it is.",
    form: { file: FILE, reader: "saveRules", ticked: "on" },
    check: anyOf(
      ["test_suffix", "dedupe", "gst_plot", "gst_villa", "sold_field_plot", "sold_field_villa"],
      "Say which rule changes.",
    ),
    fields: [
      { key: "test_suffix", label: "Test-unit ending", kind: "text", optional: true, max: 20 },
      { key: "dedupe", label: "Drop stale duplicate schedules", kind: "yesno", optional: true },
      { key: "gst_plot", label: "Plot GST %", kind: "amount", optional: true, keep: true },
      { key: "gst_villa", label: "Villa GST %", kind: "amount", optional: true, keep: true },
      {
        key: "sold_field_plot",
        label: "Plot sold value",
        kind: "choice",
        choices: ["price", "incl"],
        labels: { price: "Price", incl: "Price with GST" },
        optional: true,
        keep: true,
      },
      {
        key: "sold_field_villa",
        label: "Villa sold value",
        kind: "choice",
        choices: ["price", "incl"],
        labels: { price: "Price", incl: "Price with GST" },
        optional: true,
        keep: true,
      },
    ],
  },
  {
    key: "saarang_excluded_add",
    tool: TOOL,
    title: "A Zoho receipt, left out of the Saarang figures",
    description:
      "A receipt number Zoho lists that is left out of every collection figure, with why.",
    adds: true,
    form: { file: FILE, reader: "addExcludedReceipt" },
    fields: [
      { key: "receipt_no", label: "Receipt", kind: "text", max: 60 },
      { key: "reason", label: "Why", kind: "text", optional: true, max: 500 },
    ],
  },
  {
    key: "saarang_correction_add",
    tool: TOOL,
    title: "A Saarang milestone correction",
    description:
      "An amount added to (or, below zero, taken off) one unit's milestone, applied once: the first of its milestones whose stage starts with the words given, or its first milestone when no stage is given.",
    adds: true,
    form: { file: FILE, reader: "addCorrection" },
    check: zohoUnit,
    fields: [
      unit,
      { key: "stage", label: "Milestone stage", kind: "text", optional: true, max: 200 },
      { key: "delta", label: "Amount", kind: "amount", signed: true },
      note,
    ],
  },
  {
    key: "saarang_unit_add",
    tool: TOOL,
    title: "A sold Saarang unit Zoho is missing",
    description:
      "A sold unit the Zoho CRM exports leave out, with its sold value and its completed and pending milestone amounts. It counts only while Zoho still lacks it; once Zoho lists it again, Zoho's figures are used.",
    adds: true,
    form: { file: FILE, reader: "addExtraUnit" },
    check: zohoUnit,
    fields: [
      unit,
      { key: "applicant", label: "Applicant", kind: "text", optional: true, max: 200 },
      rupees("sold_value", "Sold value"),
      rupees("completed", "Completed milestones", true),
      rupees("pending", "Pending milestones", true),
      note,
    ],
  },
  {
    key: "saarang_excluded_remove",
    tool: TOOL,
    title: "A left-out receipt, counted again",
    description: "Takes a receipt off the left-out list, so the figures count it again.",
    fields: [
      {
        key: "rule_id",
        label: "Receipt",
        kind: "id",
        table: "saarang_collection_excluded_receipts",
        record: true,
      },
    ],
  },
  {
    key: "saarang_correction_remove",
    tool: TOOL,
    title: "A Saarang milestone correction, removed",
    description: "Removes a correction; the milestone counts as Zoho has it again.",
    fields: [
      {
        key: "rule_id",
        label: "Correction",
        kind: "id",
        table: "saarang_collection_corrections",
        record: true,
      },
    ],
  },
  {
    key: "saarang_unit_remove",
    tool: TOOL,
    title: "A Saarang unit added by hand, removed",
    description: "Removes a unit added because Zoho was missing it.",
    fields: [
      {
        key: "rule_id",
        label: "Unit",
        kind: "id",
        table: "saarang_collection_extra_units",
        record: true,
      },
    ],
  },
]);
