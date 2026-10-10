import { Document, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  DocumentHeading,
  DocumentPage,
  DocumentTable,
  MetaBlock,
  NotesBlock,
  SectionLabel,
  Signatures,
  type Column,
  type DocumentMeta,
  type LetterheadCompany,
} from "@/lib/pdf/document";
import { pdf } from "@/lib/pdf/theme";
import { formatAmount, formatDate, formatPercent, formatQuantity } from "@/lib/format";
import type { BillLineRow } from "./line-queries";
import { billLineMoney, rollUpBill } from "./math";
import type { BillSettlement } from "./payment-queries";
import type { BillDetail } from "./queries";

/**
 * A bill on paper (plan.md B7): the company's letterhead, the bill number
 * with the vendor or contractor's name beside it, the project, villa and
 * what it is against, its lines, the totals, and what has been paid and
 * is pending. A bill not yet approved prints with the DRAFT watermark.
 * Amounts in digits only (Helvetica has no ₹ glyph), the currency said
 * once.
 */

export type BillPdfData = {
  bill: BillDetail;
  lines: BillLineRow[];
  settlement: BillSettlement;
  company: LetterheadCompany | null;
};

const styles = StyleSheet.create({
  currencyNote: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginBottom: 6 },
  totalsBox: { alignSelf: "flex-end", width: "45%", marginTop: 10 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { fontSize: pdf.size.body, color: pdf.color.muted },
  totalsValue: { fontSize: pdf.size.body },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: pdf.color.ruleStrong,
    paddingTop: 6,
    marginTop: 3,
  },
  grandLabel: { fontFamily: pdf.fontBold, fontSize: pdf.size.title },
  grandValue: { fontFamily: pdf.fontBold, fontSize: pdf.size.title },
});

const moneyOf = (line: BillLineRow) =>
  billLineMoney({
    quantity: line.quantity,
    rate: line.rate,
    gst_pct: line.gst_pct,
    discount_amount: line.discount_amount,
    other_charges: line.other_charges,
  });

const columns: Column<BillLineRow>[] = [
  { header: "#", width: 0.4, render: (_row, index) => String(index + 1) },
  {
    header: "Line",
    width: 3.4,
    render: (row) => row.description,
    detail: (row) => [row.work_label, row.note].filter(Boolean).join(" · ") || null,
  },
  {
    header: "Quantity",
    width: 1.1,
    align: "right",
    render: (row) =>
      row.quantity === null ? "Lump sum" : `${formatQuantity(row.quantity)} ${row.uom ?? ""}`,
  },
  { header: "Rate", width: 1, align: "right", render: (row) => formatAmount(row.rate) },
  {
    header: "Disc.",
    width: 0.8,
    align: "right",
    render: (row) => (row.discount_amount ? formatAmount(row.discount_amount) : "—"),
  },
  { header: "GST", width: 0.6, align: "right", render: (row) => formatPercent(row.gst_pct) },
  {
    header: "Other",
    width: 0.8,
    align: "right",
    render: (row) => (row.other_charges ? formatAmount(row.other_charges) : "—"),
  },
  {
    header: "Amount",
    width: 1.1,
    align: "right",
    render: (row) => formatAmount(moneyOf(row)?.total),
  },
];

const KIND_LABEL: Record<BillDetail["kind"], string> = {
  po: "Material bill",
  contract: "Work-order bill",
  nmr: "Daily wages (NMR)",
};

export function BillDocument({ data }: { data: BillPdfData }) {
  const { bill, lines, settlement } = data;
  const isDraft = bill.status === "recorded";
  const party = bill.vendor_name ?? "Direct labour";
  const against =
    bill.po_reference ?? bill.contract_reference ?? (bill.kind === "nmr" ? "Muster roll" : "—");
  // An itemised bill's figures are its lines'; an older bill's are as typed.
  const totals = lines.length
    ? rollUpBill(lines.map((line) => ({ ...line, discount_amount: line.discount_amount })))
    : { taxable: bill.taxable_amount, gst: bill.gst_amount, other: 0, total: bill.total_amount };

  const meta: DocumentMeta = {
    documentType: "BILL",
    reference: `${bill.reference} · ${party}`,
    footerLeft: `${bill.project_name} · ${bill.reference} · ${party}`,
    isDraft,
    company: data.company,
  };

  return (
    <Document
      title={`Goodearth Bill — ${bill.reference}`}
      author="Goodearth"
      creator="Goodearth Toolbox"
    >
      <DocumentPage meta={meta}>
        <DocumentHeading
          title={`${bill.reference} — ${party}`}
          subtitle={[bill.project_name, bill.scope_name ?? "General", KIND_LABEL[bill.kind]].join(
            " · ",
          )}
        />

        <MetaBlock
          items={[
            { label: bill.kind === "nmr" ? "Muster roll" : "Invoice", value: bill.invoice_no },
            { label: "Invoice date", value: formatDate(bill.invoice_date) },
            { label: "Against", value: against },
            {
              label: "Status",
              value: isDraft
                ? "DRAFT — not approved"
                : bill.status === "paid"
                  ? "Paid"
                  : "Approved",
            },
            { label: "Recorded by", value: bill.created_by_name ?? "—" },
            { label: "Approved by", value: bill.approved_by_name ?? "—" },
            { label: "Paid", value: formatAmount(settlement.paid + settlement.recovered) },
            { label: "Pending", value: formatAmount(settlement.pending) },
          ]}
        />

        {lines.length > 0 && (
          <>
            <SectionLabel>Lines</SectionLabel>
            <Text style={styles.currencyNote}>All amounts in Indian Rupees.</Text>
            <DocumentTable columns={columns} rows={lines} />
          </>
        )}

        <View style={styles.totalsBox} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Taxable value</Text>
            <Text style={styles.totalsValue}>{formatAmount(totals.taxable)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>GST</Text>
            <Text style={styles.totalsValue}>{formatAmount(totals.gst)}</Text>
          </View>
          {totals.other > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Other charges</Text>
              <Text style={styles.totalsValue}>{formatAmount(totals.other)}</Text>
            </View>
          )}
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{formatAmount(bill.total_amount)}</Text>
          </View>
          {settlement.paid + settlement.recovered > 0 && (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Paid</Text>
                <Text style={styles.totalsValue}>{formatAmount(settlement.paid)}</Text>
              </View>
              {settlement.recovered > 0 && (
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Recovered from advances</Text>
                  <Text style={styles.totalsValue}>{formatAmount(settlement.recovered)}</Text>
                </View>
              )}
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Pending</Text>
                <Text style={styles.totalsValue}>{formatAmount(settlement.pending)}</Text>
              </View>
            </>
          )}
        </View>

        <NotesBlock
          notes={[
            { label: "Total set by hand", text: bill.total_override_note },
            { label: "Note", text: bill.note },
          ]}
        />

        {!isDraft && <Signatures labels={["Prepared by", "Approved by", `Received — ${party}`]} />}
      </DocumentPage>
    </Document>
  );
}
