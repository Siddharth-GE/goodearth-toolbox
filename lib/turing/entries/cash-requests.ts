/** Bills' weekly cash requests: what is asked for, what the approver releases, and paying each line out. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

const request: Field = {
  key: "request_id",
  label: "Cash request",
  kind: "id",
  table: "cash_requests",
  record: true,
};
const line: Field = {
  key: "item_id",
  label: "Line",
  kind: "id",
  table: "cash_request_items",
  record: true,
};

/** A request's steps, from the status each starts at, as the request's buttons offer them. */
export const STEPS = {
  submit: "draft",
  release: "submitted",
  send_back: "submitted",
  close: "released",
} as const;

/** What a line can still be paid: what was released for it, less what is paid against it already. */
export const leftToPay = (released: number | null, paid: number) =>
  Math.max(0, Math.round(((released ?? 0) - paid) * 100) / 100);

export const CASH_REQUESTS = defineEntries([
  {
    key: "cash_request_new",
    tool: "/bills",
    title: "A cash request, started",
    description:
      "Starts a draft cash request for the week of the day given (its Monday); then put bills and advances on it.",
    adds: true,
    fields: [{ key: "week_of", label: "For the week of", kind: "date" }],
  },
  {
    key: "cash_request_bill",
    tool: "/bills",
    title: "A bill, put on a cash request",
    description:
      "Puts an approved bill with something pending on a draft cash request, asking for an amount above zero (usually what is pending). A bill goes on a request once.",
    adds: true,
    fields: [
      request,
      { key: "bill_id", label: "Bill", kind: "id", table: "bills" },
      { key: "amount", label: "Asked for (₹)", kind: "amount", paise: true },
    ],
  },
  {
    key: "cash_request_advance",
    tool: "/bills",
    title: "An advance, put on a cash request",
    description:
      "Asks on a draft cash request for an advance to a contractor or supplier for a project, optionally against one of their approved work orders on that project (labour_contracts), with an amount above zero and a note.",
    adds: true,
    fields: [
      request,
      { key: "vendor_id", label: "Contractor or supplier", kind: "id", table: "vendors" },
      { key: "project_id", label: "Project", kind: "id", table: "projects" },
      {
        key: "work_order_id",
        label: "Work order",
        kind: "id",
        table: "labour_contracts",
        optional: true,
      },
      { key: "amount", label: "Asked for (₹)", kind: "amount", paise: true },
      { key: "note", label: "Note", kind: "text", optional: true },
    ],
  },
  {
    key: "cash_request_amount",
    tool: "/bills",
    title: "A cash request line's amount",
    description:
      "On a draft request, what a line asks for (above zero). On a submitted one, what is released for it (zero to what was asked): the approver's cut.",
    // A release may be cut to zero, so this is not a paise field; the two decimals are held here.
    check: (values) =>
      /^\d+(\.\d{1,2})?$/.test(String(values.amount))
        ? undefined
        : "The amount is rupees to the paise, like 25000.50.",
    fields: [line, { key: "amount", label: "Amount (₹)", kind: "amount" }],
  },
  {
    key: "cash_request_line_remove",
    tool: "/bills",
    title: "A cash request line, taken off",
    description: "Takes a bill or advance off a draft cash request.",
    fields: [line],
  },
  {
    key: "cash_request_note",
    tool: "/bills",
    title: "A cash request's note",
    description: "A draft cash request's note for the approver; empty clears it.",
    check: (values: Record<string, Value>) =>
      "note" in values ? undefined : "Give the note, or empty to clear it.",
    fields: [request, { key: "note", label: "Note", kind: "text", optional: true, max: 2000 }],
  },
  {
    key: "cash_request_step",
    tool: "/bills",
    title: "A cash request, moved on",
    description:
      "submit sends a draft with lines to the approver; release releases a submitted one (lines not cut go as asked); send_back returns a submitted one to draft with a note saying what needs changing; close closes a released one.",
    check: (values) =>
      values.step === "send_back"
        ? values.note
          ? undefined
          : "Say what needs changing — sending back needs a note."
        : values.note
          ? "Only sending back takes a note."
          : undefined,
    fields: [
      request,
      {
        key: "step",
        label: "Step",
        kind: "choice",
        choices: Object.keys(STEPS),
        labels: {
          submit: "Submit",
          release: "Release",
          send_back: "Send back",
          close: "Close",
        },
      },
      { key: "note", label: "What needs changing", kind: "text", optional: true },
    ],
  },
  {
    key: "cash_request_delete",
    tool: "/bills",
    title: "A cash request, deleted",
    description: "Deletes a draft cash request with its lines; no money has moved on a draft.",
    fields: [request],
  },
  {
    key: "cash_request_pay",
    tool: "/bills",
    title: "A cash request line, paid",
    description:
      "On a released cash request, records the money paid for one line — the bill's payment, or the advance given — at most what was released for it less what is paid already (and, for a bill, what it has pending), with the day and the UTR, cheque number or UPI reference. Money recorded is permanent: a mistake is reversed with money_reverse.",
    adds: true,
    fields: [
      line,
      { key: "amount", label: "Amount (₹)", kind: "amount", paise: true },
      { key: "paid_on", label: "Paid on", kind: "date" },
      { key: "reference", label: "UTR / cheque / UPI ref", kind: "text", max: 120 },
    ],
  },
]);
