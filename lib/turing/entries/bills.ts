/** Bills: recorded against a PO, a work order or a muster roll, with their lines, through Bills' own saves. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

type Values = Record<string, Value>;

const bill: Field = { key: "bill_id", label: "Bill", kind: "id", table: "bills", record: true };
const invoiceNo: Field = { key: "invoice_no", label: "Invoice no.", kind: "text", max: 100 };
const invoiceDate: Field = { key: "invoice_date", label: "Invoice date", kind: "date" };
const note: Field = { key: "note", label: "Note", kind: "text", optional: true };
const quantity: Field = { key: "quantity", label: "Quantity", kind: "amount" };
const rate: Field = { key: "rate", label: "Rate", kind: "amount" };
const gst: Field = { key: "gst_pct", label: "GST %", kind: "amount" };
const discount: Field = {
  key: "discount_amount",
  label: "Discount ₹",
  kind: "amount",
  optional: true,
};
const otherCharges: Field = {
  key: "other_charges",
  label: "Other charges ₹",
  kind: "amount",
  optional: true,
};
const lineNote: Field = { key: "line_note", label: "Line note", kind: "text", optional: true };

const PAPER =
  "Give each line's figures as the paper bill shows them — quantity, rate per unit before GST, GST % (0 to 100), and any discount or other charges in rupees — reading the order first for what it holds. Over-billing the order is allowed (Bills warns, never blocks). Invoice number and date are as printed.";

/** The three daily-wages trades a muster roll line can be; any other line is "other". */
export const TRADES = [
  "Masons (man-days)",
  "Helpers (man-days)",
  "Other labour (man-days)",
] as const;

export const lineKindOfNmr = (description: string) =>
  (TRADES as readonly string[]).includes(description.trim()) ? "nmr" : "other";

export const BILLS = defineEntries([
  {
    key: "bill_po",
    tool: "/bills",
    title: "A bill against a purchase order",
    description: `Records a supplier's bill against an issued or completed PO: one row per PO line billed (purchase_order_lines.id of that PO), its material and unit coming from the PO. ${PAPER}`,
    adds: true,
    lines: { noun: "Bill" },
    fields: [
      { key: "po_id", label: "PO", kind: "id", table: "purchase_orders", header: true },
      { ...invoiceNo, header: true },
      { ...invoiceDate, header: true },
      { ...note, header: true },
      { key: "po_line_id", label: "PO line", kind: "id", table: "purchase_order_lines" },
      quantity,
      rate,
      gst,
      discount,
      otherCharges,
      lineNote,
    ],
  },
  {
    key: "bill_work_order",
    tool: "/bills",
    title: "A bill against a work order",
    description: `Records a contractor's bill against an approved, active work order: one row per work billed (labour_contract_lines.id of that order), so the bill pays that work; its description and unit come from the order. A lump-sum work takes no quantity and its rate is the amount billed now; any other work needs the quantity billed. GST % is 0 if left out. ${PAPER}`,
    adds: true,
    lines: { noun: "Bill" },
    fields: [
      {
        key: "work_order_id",
        label: "Work order",
        kind: "id",
        table: "labour_contracts",
        header: true,
      },
      { ...invoiceNo, header: true },
      { ...invoiceDate, header: true },
      { ...note, header: true },
      {
        key: "work_order_line_id",
        label: "Work",
        kind: "id",
        table: "labour_contract_lines",
      },
      { ...quantity, optional: true },
      rate,
      { ...gst, optional: true, start: "0" },
      discount,
      otherCharges,
      lineNote,
    ],
  },
  {
    key: "bill_nmr",
    tool: "/bills",
    title: "A daily-wages (NMR) bill",
    description: `Records a muster roll not logged on site: for a project, or one villa of it, from a contractor (vendor_id) or paid directly (left out). One row per line: a trade's man-days, described exactly as one of "${TRADES.join('", "')}", or any other line (with its unit if it has one). A contractor's bill is one bill for the whole company: give each row its own villa (line_plot_id, any villa of the project's company) and leave the header villa out. GST % is 0 if left out. Labour logged on site goes through labour_to_bill instead. ${PAPER}`,
    adds: true,
    lines: { noun: "Bill" },
    fields: [
      { key: "project_id", label: "Project", kind: "id", table: "projects", header: true },
      { key: "plot_id", label: "Villa", kind: "id", table: "plots", optional: true, header: true },
      {
        key: "vendor_id",
        label: "Contractor",
        kind: "id",
        table: "vendors",
        optional: true,
        header: true,
      },
      { ...invoiceNo, header: true },
      { ...invoiceDate, header: true },
      { ...note, header: true },
      { key: "description", label: "Line", kind: "text", max: 300 },
      { key: "line_plot_id", label: "Line's villa", kind: "id", table: "plots", optional: true },
      quantity,
      { key: "uom", label: "Unit", kind: "text", optional: true, max: 40 },
      rate,
      { ...gst, optional: true, start: "0" },
      discount,
      otherCharges,
      lineNote,
    ],
  },
  {
    key: "bill_details",
    tool: "/bills",
    title: "A bill's invoice details",
    description:
      "Changes a recorded bill's invoice number, invoice date or note. Its PO or work order, vendor and number never change.",
    fields: [
      bill,
      { ...invoiceNo, optional: true, keep: true },
      { ...invoiceDate, optional: true, keep: true },
      note,
    ],
  },
  {
    key: "bill_lines_change",
    tool: "/bills",
    title: "A bill's lines, changed or removed",
    description:
      "Changes or removes lines on a recorded bill: one row per line (bill_lines.id of that bill), all of one bill's rows saved together. remove true takes a line off (a bill keeps at least one). Otherwise give what changes: description, quantity, rate, GST %, discount or other charges in rupees, note; each left out stays as it is. A bill made from labour entries keeps its lines and quantities; only their money changes.",
    lines: { noun: "Bill" },
    check: (values) =>
      values.remove === true &&
      [
        "description",
        "quantity",
        "rate",
        "gst_pct",
        "discount_amount",
        "other_charges",
        "line_note",
      ].some((key) => key in values)
        ? "A line being removed takes no changes."
        : undefined,
    fields: [
      { ...bill, header: true },
      { key: "bill_line_id", label: "Line", kind: "id", table: "bill_lines", record: true },
      { key: "remove", label: "Remove", kind: "yesno", optional: true },
      {
        key: "description",
        label: "Description",
        kind: "text",
        optional: true,
        keep: true,
        max: 300,
      },
      { ...quantity, optional: true, keep: true },
      { ...rate, optional: true, keep: true },
      { ...gst, optional: true, keep: true },
      discount,
      otherCharges,
      lineNote,
    ],
  },
  {
    key: "bill_charges",
    tool: "/bills",
    title: "A bill's charges",
    description:
      "Freight, loading and the like on a recorded bill with lines: an amount in rupees above 0 with its GST % (new charges start at 18) and what for. An empty amount removes the charges.",
    fields: [
      bill,
      { key: "amount", label: "Amount", kind: "amount", optional: true },
      { key: "gst_pct", label: "GST %", kind: "amount", optional: true },
      { key: "note", label: "What for", kind: "text", optional: true },
    ],
  },
  {
    key: "bill_total",
    tool: "/bills",
    title: "A daily-wages bill's total, set by hand",
    description:
      "Sets a recorded daily-wages bill's total by hand when the muster roll differs from heads × rates, with the reason. A total or reason left out keeps the one already set (a first total needs both); an empty total goes back to the lines' sum and drops the reason.",
    fields: [
      bill,
      { key: "total", label: "Total ₹", kind: "amount", optional: true },
      { key: "reason", label: "Why", kind: "text", optional: true },
    ],
  },
  {
    key: "bill_delete",
    tool: "/bills",
    title: "A bill, deleted",
    description:
      "Deletes a recorded bill (not yet approved) entered by mistake, with its lines; labour entries it billed are free to be sent again, and its number stays used. Only the person who recorded it or an admin.",
    fields: [bill],
  },
  {
    key: "bill_approve",
    tool: "/bills",
    title: "A bill, approved",
    description:
      "Approves a recorded bill (bills.status recorded), so it can be paid; its figures can no longer change. Check its lines and total against the vendor's bill first.",
    fields: [bill],
  },
  {
    key: "bill_send_back",
    tool: "/bills",
    title: "A bill, sent back",
    description:
      "Sends an approved bill back to recorded so its figures can be fixed, with a note saying what needs changing. Refused while money paid against it stands — reverse that first.",
    fields: [bill, { key: "note", label: "What needs changing", kind: "text" }],
  },
  {
    key: "labour_to_bill",
    tool: "/bills",
    title: "Labour logs, sent to a bill",
    description:
      "Makes one bill from labour the supervisors logged (labour_logs not yet billed), all of one kind — daily wages, or piece-work — one contractor and one project; the logs are stamped and their quantities fixed. One row per log. Daily wages: the day rate for each trade (mason_rate, helper_rate, other_rate) and, if the muster roll differs, its total with the reason. Piece-work: each row's rate (a lump sum's: its amount), and the contractor's approved work order if billed against one (else it is a direct labour bill). bill_reference is the muster roll or bill number. GST % is 0 if left out.",
    adds: true,
    lines: { noun: "Bill" },
    fields: [
      {
        key: "work_order_id",
        label: "Work order",
        kind: "id",
        table: "labour_contracts",
        optional: true,
        header: true,
      },
      { key: "bill_reference", label: "Reference", kind: "text", max: 100, header: true },
      { key: "bill_date", label: "Bill date", kind: "date", header: true },
      { key: "mason_rate", label: "Mason ₹/day", kind: "amount", optional: true, header: true },
      { key: "helper_rate", label: "Helper ₹/day", kind: "amount", optional: true, header: true },
      { key: "other_rate", label: "Other ₹/day", kind: "amount", optional: true, header: true },
      { ...gst, optional: true, start: "0", header: true },
      { key: "total_override", label: "Total ₹", kind: "amount", optional: true, header: true },
      { key: "override_note", label: "Why", kind: "text", optional: true, header: true },
      { ...note, header: true },
      { key: "labour_log_id", label: "Labour log", kind: "id", table: "labour_logs" },
      { key: "piece_rate", label: "Rate", kind: "amount", optional: true },
    ],
  },
]);

/** A number given, or null for one left out or empty. */
export const numberOf = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] !== "" ? Number(values[key]) : null;
