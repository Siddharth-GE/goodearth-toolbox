// From 0117's flat owner view. A confirmed salary is ONE line per person per month.

import type { DatasetDef } from "./types";

const BIRDWING_EXPENSES_SELECT =
  "expense_id, month, head, is_salary, description, spent_on, amount, paid_to, status, has_bill";

const BIRDWING_EXPENSES_OPTIONS_SELECT = "head, paid_to, status";

export const birdwingExpenses: DatasetDef = {
  label: "Birdwing expenses",
  description: "One row per expense line at Birdwing Farmstay, in the month it belongs to.",
  source: "birdwing_expense_facts",
  select: BIRDWING_EXPENSES_SELECT,
  optionsSelect: BIRDWING_EXPENSES_OPTIONS_SELECT,
  projectField: null,
  pageOrder: ["expense_id"],
  dateFields: ["month", "spent_on"],
  money: true,
  defaultColumns: ["month", "head", "description", "paid_to", "amount"],
  defaultSort: [{ field: "month", dir: "desc" }],
  fields: {
    month: {
      label: "Month",
      type: "date",
      path: "month",
      filterColumn: "month",
      sortColumn: "month",
      groupable: true,
      aggregates: [],
    },
    head: {
      label: "Head",
      type: "text",
      path: "head",
      filterColumn: "head",
      sortColumn: "head",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    description: {
      label: "What for",
      type: "text",
      path: "description",
      sortColumn: "description",
      groupable: false,
      aggregates: [],
    },
    paid_to: {
      label: "Paid to",
      type: "text",
      path: "paid_to",
      filterColumn: "paid_to",
      sortColumn: "paid_to",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    spent_on: {
      label: "Paid on",
      type: "date",
      path: "spent_on",
      filterColumn: "spent_on",
      sortColumn: "spent_on",
      groupable: false,
      aggregates: [],
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
    is_salary: {
      label: "Salary",
      type: "bool",
      path: "is_salary",
      filterColumn: "is_salary",
      groupable: true,
      aggregates: [],
    },
    has_bill: {
      label: "Bill attached",
      type: "bool",
      path: "has_bill",
      filterColumn: "has_bill",
      groupable: true,
      aggregates: [],
    },
  },
};
