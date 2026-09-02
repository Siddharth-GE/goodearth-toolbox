// ---------------------------------------------------------------------
// bills — every bill recorded, header level
// ---------------------------------------------------------------------
// A bill has no lines by design (the paper invoice's figures are the
// record), so this dataset IS the billed money. No purchase_orders
// embed on purpose: bills.po_id resolves to three relations and nothing
// here needs it.

import type { DatasetDef } from "./types";

const BILLS_SELECT =
  "id, bill_no, reference, invoice_no, invoice_date, taxable_amount, gst_amount, total_amount, " +
  "status, kind, project_id, unit_id, vendor_id, created_at, paid_at, " +
  "projects!bills_project_id_fkey(name), units!bills_unit_id_fkey(name), " +
  "vendors!bills_vendor_id_fkey(name)";

const BILLS_OPTIONS_SELECT = "status, kind";

export const bills: DatasetDef = {
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
