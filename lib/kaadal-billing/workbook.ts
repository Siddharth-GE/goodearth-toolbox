/** The Export to Excel workbook: the sheet's three tabs, as its own export wrote them. Pure. */
import { formatDate } from "@/lib/format";
import type { WorkbookSheet } from "@/lib/xlsx";

import {
  allocLabel,
  figures,
  paymentsByOrder,
  plotSort,
  plotTotals,
  r2,
  rupees,
  type Ledger,
} from "./ledger";

const STATE = { paid: "Fully paid", part: "Part paid", none: "Not paid" } as const;

export function ledgerSheets(ledger: Ledger): WorkbookSheet[] {
  const vendors = new Map(ledger.vendors.map((v) => [v.id, v]));
  const name = (id: string) => vendors.get(id)?.name ?? "";
  const pays = paymentsByOrder(ledger.payments);

  const summary: WorkbookSheet["rows"] = [
    [
      "Vendor",
      "Bank Details",
      "Plots",
      "Item",
      "Order Value (₹)",
      "Deduction (₹)",
      "Net Payable (₹)",
      "Paid by Kaadal (₹)",
      "Paid by Client (₹)",
      "Total Paid (₹)",
      "Balance (₹)",
      "Status",
      "Payments",
      "Deduction Reason",
      "How Paid",
      "Notes",
    ],
  ];
  const total = [0, 0, 0, 0, 0, 0, 0];
  for (const o of ledger.orders) {
    const list = pays.get(o.id) ?? [];
    const f = figures(o, list);
    const row = [o.gross, o.deduction, f.net, f.byKaadal, f.byClient, f.paid, f.balance];
    row.forEach((v, i) => (total[i] += v));
    summary.push([
      name(o.vendorId),
      vendors.get(o.vendorId)?.bank ?? "",
      o.plots.join(", "),
      o.item,
      ...row.map(r2),
      STATE[f.state],
      list
        .map((p) => `${rupees(p.amount)}${p.paidOn ? ` on ${formatDate(p.paidOn)}` : ""}`)
        .join("; "),
      o.deductionNote,
      o.payNote,
      o.notes,
    ]);
  }
  summary.push(["TOTAL", "", "", "", ...total.map(r2)]);

  const orders = new Map(ledger.orders.map((o) => [o.id, o]));
  const payments: WorkbookSheet["rows"] = [
    [
      "Date",
      "Vendor",
      "Plots",
      "Item",
      "For plot",
      "Type",
      "Paid by",
      "Amount (₹)",
      "Reference",
      "Note",
    ],
  ];
  for (const p of ledger.payments
    .filter((p) => orders.has(p.orderId))
    .sort((a, b) => (a.paidOn ?? "").localeCompare(b.paidOn ?? ""))) {
    const o = orders.get(p.orderId)!;
    payments.push([
      p.paidOn ? formatDate(p.paidOn) : "",
      name(o.vendorId),
      o.plots.join(", "),
      o.item,
      o.plots.length > 1 ? allocLabel(p) || "Shared by value" : (o.plots[0] ?? ""),
      p.kind,
      p.paidBy,
      r2(p.amount),
      p.reference,
      p.notes,
    ]);
  }

  const byPlot: WorkbookSheet["rows"] = [
    [
      "Plot",
      "Vendor",
      "Item",
      "Order Value (₹)",
      "Deduction (₹)",
      "Net Payable (₹)",
      "Paid (₹)",
      "Balance (₹)",
    ],
  ];
  for (const t of plotTotals(ledger).sort((a, b) => plotSort(a.plot, b.plot))) {
    for (const { order, share } of t.rows) {
      byPlot.push([
        t.plot,
        name(order.vendorId),
        order.item,
        r2(share.value),
        r2(share.deduction),
        r2(share.net),
        r2(share.paid),
        r2(share.balance),
      ]);
    }
    byPlot.push([
      `${t.plot} — Total`,
      "",
      "",
      r2(t.value),
      r2(t.deduction),
      r2(t.net),
      r2(t.paid),
      r2(t.balance),
    ]);
    byPlot.push([]);
  }

  return [
    {
      name: "Vendor Payment Summary",
      rows: summary,
      columnWidths: [24, 40, 18, 18, 14, 12, 14, 14, 14, 14, 14, 12, 40, 24, 18, 30],
    },
    { name: "Payments", rows: payments, columnWidths: [12, 24, 18, 18, 18, 14, 10, 14, 18, 24] },
    { name: "Plot-wise Summary", rows: byPlot, columnWidths: [16, 24, 18, 14, 12, 14, 14, 14] },
  ];
}
