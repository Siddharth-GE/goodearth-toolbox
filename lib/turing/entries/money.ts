/** Money out: a bill's payments and recoveries, reversing either or an advance, and Financial Management's funding. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

const FUNDING = "lib/financial-management/actions.ts";

/** Financial Management's two lists, as lib/financial-management/kinds.ts has them (a test holds the two together). */
export const FACILITY_KINDS = ["bank_loan", "private_equity", "private_debt"] as const;
export const MOVEMENT_KINDS = ["drawdown", "repayment", "interest"] as const;

const bill: Field = { key: "bill_id", label: "Bill", kind: "id", table: "bills" };
const facility: Field = {
  key: "facility_id",
  label: "Facility",
  kind: "id",
  table: "funding_facilities",
  record: true,
};
const note: Field = { key: "note", label: "Note", kind: "text", optional: true };

const PERMANENT =
  "Money recorded is permanent: a mistake is reversed with money_reverse, never edited.";

const facilityFields = (change: boolean): Field[] => {
  const may = change ? ({ optional: true, keep: true } as const) : {};
  return [
    { key: "party", label: "Bank or investor", kind: "text", max: 120, ...may },
    {
      key: "kind",
      label: "Kind",
      kind: "choice",
      choices: FACILITY_KINDS,
      labels: {
        bank_loan: "Bank loan",
        private_equity: "Private equity",
        private_debt: "Private debt",
      },
      ...may,
    },
    {
      key: "interest_rate_pct",
      label: "Interest % a year",
      kind: "amount",
      optional: true,
    },
    { key: "start_date", label: "Starts", kind: "date", optional: true },
    {
      key: "sanctioned_amount",
      label: "Sanctioned (₹)",
      kind: "amount",
      optional: true,
      paise: true,
    },
    { key: "terms", label: "Terms", kind: "text", optional: true, max: 2000 },
  ];
};

const rateCheck = (values: Record<string, Value>) =>
  values.interest_rate_pct !== undefined &&
  values.interest_rate_pct !== "" &&
  Number(values.interest_rate_pct) > 100
    ? "That rate reads as more than 100% a year — check it."
    : undefined;

export const MONEY = defineEntries([
  {
    key: "bill_payment",
    tool: "/bills",
    title: "A bill's payment",
    description: `Records money paid against an approved bill, at most what it has pending, with the day it was paid and the UTR, cheque number or UPI reference. ${PERMANENT}`,
    adds: true,
    fields: [
      bill,
      { key: "amount", label: "Amount (₹)", kind: "amount", paise: true },
      { key: "paid_on", label: "Paid on", kind: "date" },
      { key: "reference", label: "UTR / cheque / UPI ref", kind: "text", max: 120 },
      note,
    ],
  },
  {
    key: "bill_recovery",
    tool: "/bills",
    title: "A bill, settled from an advance",
    description: `Settles part of an approved bill from an advance already paid to the same vendor (contractor_advances, not reversed), at most what is left of the advance and what the bill has pending. ${PERMANENT}`,
    adds: true,
    fields: [
      bill,
      { key: "advance_id", label: "Advance", kind: "id", table: "contractor_advances" },
      { key: "amount", label: "Amount (₹)", kind: "amount", paise: true },
      { key: "recovered_on", label: "On", kind: "date" },
      note,
    ],
  },
  {
    key: "money_reverse",
    tool: "/bills",
    title: "Money, reversed",
    description:
      "Reverses one payment (bill_payments), advance (contractor_advances) or recovery from an advance (advance_recoveries), with the reason: the same amount is entered the other way and both stay on record. Give exactly one id. Never a reversal itself, never twice; an advance only once nothing is left recovered from it.",
    check: (values) =>
      ["payment_id", "advance_id", "recovery_id"].filter((key) => key in values && values[key])
        .length === 1
        ? undefined
        : "Name exactly one payment, advance or recovery.",
    fields: [
      {
        key: "payment_id",
        label: "Payment",
        kind: "id",
        table: "bill_payments",
        optional: true,
      },
      {
        key: "advance_id",
        label: "Advance",
        kind: "id",
        table: "contractor_advances",
        optional: true,
      },
      {
        key: "recovery_id",
        label: "Recovery",
        kind: "id",
        table: "advance_recoveries",
        optional: true,
      },
      { key: "reason", label: "Why", kind: "text" },
    ],
  },
  {
    key: "facility_new",
    tool: "/financial-management",
    title: "A funding facility, added",
    description:
      "Adds a bank loan, private equity or private debt: who it is from, its yearly interest (blank for equity), when it starts, the sanctioned amount (blank for no cap) and its terms.",
    adds: true,
    check: rateCheck,
    form: { file: FUNDING, reader: "readFacilityFields" },
    fields: facilityFields(false),
  },
  {
    key: "facility_change",
    tool: "/financial-management",
    title: "A funding facility, changed",
    description:
      "Changes a facility: who it is from, its kind, yearly interest, start, sanctioned amount or terms. A changed rate recomputes its whole interest history.",
    check: (values) =>
      rateCheck(values) ??
      (["party", "kind", "interest_rate_pct", "start_date", "sanctioned_amount", "terms"].some(
        (key) => key in values,
      )
        ? undefined
        : "Say what changes on the facility."),
    form: { file: FUNDING, reader: "readFacilityFields" },
    fields: [facility, ...facilityFields(true)],
  },
  {
    key: "facility_active",
    tool: "/financial-management",
    title: "A funding facility, closed or reopened",
    description: "Closes a facility (it stays on record with its history) or reopens it.",
    fields: [facility, { key: "active", label: "Open", kind: "yesno" }],
  },
  {
    key: "facility_delete",
    tool: "/financial-management",
    title: "A funding facility, deleted",
    description:
      "Deletes a facility entered by mistake. One with any movement recorded is refused: close it instead.",
    fields: [facility],
  },
  {
    key: "funding_movement",
    tool: "/financial-management",
    title: "A funding movement",
    description:
      "Records money drawn from a facility, repaid to it, or interest paid on it, with the day and amount (above zero). A mistake is cancelled with funding_movement_cancel, never edited.",
    adds: true,
    form: { file: FUNDING, reader: "recordMovement" },
    fields: [
      facility,
      {
        key: "kind",
        label: "Kind",
        kind: "choice",
        choices: MOVEMENT_KINDS,
        labels: { drawdown: "Drawdown", repayment: "Repayment", interest: "Interest paid" },
      },
      { key: "amount", label: "Amount (₹)", kind: "amount", paise: true },
      { key: "happened_on", label: "On", kind: "date" },
      { key: "reference", label: "Reference", kind: "text", optional: true, max: 2000 },
      { ...note, max: 2000 },
    ],
  },
  {
    key: "funding_movement_cancel",
    tool: "/financial-management",
    title: "A funding movement, cancelled",
    description:
      "Cancels a movement entered by mistake, with the reason; it stays listed, struck through, and leaves every balance.",
    fields: [
      {
        key: "movement_id",
        label: "Movement",
        kind: "id",
        table: "funding_movements",
        record: true,
      },
      { key: "reason", label: "Why", kind: "text" },
    ],
  },
]);
