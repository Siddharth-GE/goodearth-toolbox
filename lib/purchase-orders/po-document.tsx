import { Document, StyleSheet, Text, View } from "@react-pdf/renderer";
import { DocumentPage, DocumentTable, type Column, type DocumentMeta } from "@/lib/pdf/document";
import { pdf } from "@/lib/pdf/theme";
import { formatAmount, formatDate, formatPercent, formatQuantity } from "@/lib/format";
import { lineTotal, rollUpPo } from "./math";
import type { PoLineRow, PoPdfData } from "./queries";

/**
 * Document D — the purchase order, the paper a vendor supplies against.
 *
 * Built on the shared shell (letterhead, footer, table), so it looks
 * like the same company as every other Goodearth document. Amounts via
 * formatAmount, digits only — Helvetica has no ₹ glyph — with the
 * currency stated once in the heading. A draft carries the DRAFT
 * watermark and no signature block; it must never look signable.
 *
 * The money here is the vendor's purchase price and its GST. Nothing
 * from Budgets exists on the underlying tables, so nothing from Budgets
 * can appear here — the QuoteData principle, held by the schema itself.
 */

const styles = StyleSheet.create({
  h1: { fontFamily: pdf.fontBold, fontSize: pdf.size.display, letterSpacing: -0.3 },
  subtitle: { fontSize: pdf.size.body, color: pdf.color.muted, marginTop: 3 },

  metaBlock: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: pdf.color.wash,
    borderRadius: 3,
    padding: 12,
    marginTop: pdf.space.block,
  },
  metaItem: { width: "25%", paddingRight: 8 },
  metaLabel: {
    fontSize: pdf.size.tiny,
    letterSpacing: 0.6,
    color: pdf.color.muted,
    textTransform: "uppercase",
  },
  metaValue: { fontSize: pdf.size.body, marginTop: 2 },

  partyRow: { flexDirection: "row", marginTop: pdf.space.block },
  partyBox: { flex: 1, paddingRight: 14 },
  partyLabel: {
    fontFamily: pdf.fontBold,
    fontSize: pdf.size.sectionLabel,
    letterSpacing: 1,
    color: pdf.color.muted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  partyName: { fontFamily: pdf.fontBold, fontSize: pdf.size.body },
  partyLine: { fontSize: pdf.size.small, color: pdf.color.muted, marginTop: 2, lineHeight: 1.4 },

  sectionLabel: {
    fontFamily: pdf.fontBold,
    fontSize: pdf.size.sectionLabel,
    letterSpacing: 1,
    color: pdf.color.muted,
    textTransform: "uppercase",
    marginTop: pdf.space.block * 1.6,
    marginBottom: 6,
  },
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

  terms: {
    marginTop: pdf.space.block * 1.4,
    borderTopWidth: 0.5,
    borderTopColor: pdf.color.rule,
    paddingTop: 8,
  },
  termsText: { fontSize: pdf.size.tiny, color: pdf.color.muted, lineHeight: 1.5 },

  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  signatureBox: { width: "42%" },
  signatureRule: { borderTopWidth: 0.5, borderTopColor: pdf.color.ruleStrong, paddingTop: 4 },
  signatureLabel: { fontSize: pdf.size.tiny, color: pdf.color.muted },
});

const columns: Column<PoLineRow>[] = [
  { header: "#", width: 0.4, render: (_row, index) => String(index + 1) },
  {
    header: "Item",
    width: 3.2,
    render: (row) => (row.item_code ? `${row.item_name} (${row.item_code})` : row.item_name),
  },
  { header: "Indent", width: 1.3, render: (row) => row.indent_reference ?? "Direct" },
  { header: "Qty", width: 0.7, align: "right", render: (row) => formatQuantity(row.quantity) },
  { header: "Unit", width: 0.6, render: (row) => row.uom },
  { header: "Rate", width: 1, align: "right", render: (row) => formatAmount(row.rate) },
  {
    header: "GST",
    width: 0.6,
    align: "right",
    render: (row) => (row.gst_pct === null ? "—" : formatPercent(row.gst_pct)),
  },
  {
    header: "Amount",
    width: 1.2,
    align: "right",
    render: (row) =>
      formatAmount(lineTotal({ quantity: row.quantity, rate: row.rate, gst_pct: row.gst_pct })),
  },
];

export function PoDocument({ data }: { data: PoPdfData }) {
  const { po, vendor } = data;
  const totals = rollUpPo(
    po.lines.map((line) => ({ quantity: line.quantity, rate: line.rate, gst_pct: line.gst_pct })),
  );
  const isDraft = po.status === "draft";

  const meta: DocumentMeta = {
    documentType: "PURCHASE ORDER",
    reference: po.reference,
    footerLeft: `${po.project_name} · ${po.reference}`,
    isDraft,
  };

  const deliverTo =
    [data.deliver_store_name, po.deliver_note].filter(Boolean).join(" — ") || "As advised";

  return (
    <Document
      title={`Goodearth Purchase Order — ${po.reference}`}
      author="Goodearth"
      creator="Goodearth Toolbox"
    >
      <DocumentPage meta={meta}>
        <Text style={styles.h1}>{po.reference}</Text>
        <Text style={styles.subtitle}>
          {po.project_name}
          {po.scope_name ? ` · ${po.scope_name}` : ""} · Purchase Order
        </Text>

        <View style={styles.metaBlock}>
          <Meta label="Date" value={formatDate(po.issued_at ?? po.created_at)} />
          <Meta label="Expected by" value={po.expected_by ? formatDate(po.expected_by) : "—"} />
          <Meta label="Lines" value={String(po.line_count)} />
          <Meta label="Status" value={isDraft ? "DRAFT — not an order" : "Issued"} />
        </View>

        <View style={styles.partyRow}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>To (Vendor)</Text>
            <Text style={styles.partyName}>{vendor.name}</Text>
            {vendor.contact_name && <Text style={styles.partyLine}>{vendor.contact_name}</Text>}
            {vendor.mobile && <Text style={styles.partyLine}>{vendor.mobile}</Text>}
            {vendor.address && <Text style={styles.partyLine}>{vendor.address}</Text>}
            {vendor.gst_no && <Text style={styles.partyLine}>GSTIN: {vendor.gst_no}</Text>}
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Deliver to</Text>
            <Text style={styles.partyLine}>{deliverTo}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Order lines</Text>
        <Text style={styles.currencyNote}>All amounts in Indian Rupees, inclusive of GST.</Text>
        <DocumentTable columns={columns} rows={po.lines} />

        <View style={styles.totalsBox} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Taxable value</Text>
            <Text style={styles.totalsValue}>{formatAmount(totals.taxable)}</Text>
          </View>
          {[...totals.gstBySlab.entries()]
            .sort(([a], [b]) => a - b)
            .map(([slab, amount]) => (
              <View key={slab} style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>GST {formatPercent(slab)}</Text>
                <Text style={styles.totalsValue}>{formatAmount(amount)}</Text>
              </View>
            ))}
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Grand total</Text>
            <Text style={styles.grandValue}>{formatAmount(totals.grand)}</Text>
          </View>
        </View>

        {(po.terms || po.note) && (
          <View style={styles.terms}>
            {po.terms && <Text style={styles.termsText}>Terms: {po.terms}</Text>}
            {po.note && <Text style={styles.termsText}>Note: {po.note}</Text>}
          </View>
        )}

        {!isDraft && (
          <View style={styles.signatureRow}>
            <View style={styles.signatureBox}>
              <View style={styles.signatureRule}>
                <Text style={styles.signatureLabel}>For Goodearth</Text>
              </View>
            </View>
            <View style={styles.signatureBox}>
              <View style={styles.signatureRule}>
                <Text style={styles.signatureLabel}>Vendor acknowledgement</Text>
              </View>
            </View>
          </View>
        )}
      </DocumentPage>
    </Document>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}
