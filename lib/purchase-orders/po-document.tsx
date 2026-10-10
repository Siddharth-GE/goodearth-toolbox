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
} from "@/lib/pdf/document";
import { pdf } from "@/lib/pdf/theme";
import { formatAmount, formatDate, formatPercent, formatQuantity } from "@/lib/format";
import { DEFAULT_COMPANY_STATE, gstRegime } from "@/lib/line-money";
import { lineFigures, rollUpPo, summaryRows, type PoLineMoney } from "./math";
import type { PoLineRow, PoPdfData } from "./queries";

/**
 * Document D — the purchase order, the paper a vendor supplies against.
 *
 * Built on the shared shell and blocks (letterhead, heading, details band,
 * table, notes, signatures), so it looks like the same company as every
 * other Goodearth document, and it prints what the PO screen shows: per
 * line the code, material, indent and its work, quantity, rate, discount,
 * taxable value, GST and other charges; then the GST split — CGST + SGST
 * when the vendor is in the company's state, IGST otherwise. Amounts via
 * formatAmount, digits only — Helvetica has no ₹ glyph — with the currency
 * stated once. A draft carries the DRAFT watermark and no signature block.
 *
 * The money here is the vendor's purchase price and its GST. Nothing from
 * Budgets exists on the underlying tables, so nothing from Budgets can
 * appear here — the QuoteData principle, held by the schema itself.
 */

const styles = StyleSheet.create({
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

  termsText: { fontSize: pdf.size.small, color: pdf.color.ink, lineHeight: 1.5 },
});

const moneyOf = (row: PoLineRow): PoLineMoney => ({
  quantity: row.quantity,
  rate: row.rate,
  gst_pct: row.gst_pct,
  discount_pct: row.discount_pct,
  discount_amount: row.discount_amount,
  other_charges: row.other_charges,
});

function discountLabel(row: PoLineRow): string {
  if (row.discount_pct != null) return formatPercent(row.discount_pct);
  if (row.discount_amount != null) return formatAmount(row.discount_amount);
  return "—";
}

function columnsFor(interState: boolean, showInvoiced: boolean): Column<PoLineRow>[] {
  const columns: Column<PoLineRow>[] = [
    { header: "#", width: 0.35, render: (_row, index) => String(index + 1) },
    { header: "Code", width: 0.85, render: (row) => row.item_code ?? "—" },
    {
      header: "Material",
      width: 2.5,
      render: (row) => row.item_name,
      detail: (row) =>
        [row.item_category, row.item_description, row.note && `Note: ${row.note}`]
          .filter(Boolean)
          .join(" · ") || null,
    },
    {
      header: "Indent · Work",
      width: 1.5,
      render: (row) => row.indent_reference ?? "Direct",
      detail: (row) => row.work_label,
    },
    { header: "Qty", width: 0.7, align: "right", render: (row) => formatQuantity(row.quantity) },
    { header: "Unit", width: 0.5, render: (row) => row.uom },
  ];
  if (showInvoiced) {
    columns.push({
      header: "Invoiced",
      width: 0.75,
      align: "right",
      render: (row) => formatQuantity(row.billed_quantity),
    });
  }
  columns.push(
    { header: "Rate", width: 0.85, align: "right", render: (row) => formatAmount(row.rate) },
    { header: "Disc.", width: 0.65, align: "right", render: discountLabel },
    {
      header: "Taxable",
      width: 0.95,
      align: "right",
      render: (row) => formatAmount(lineFigures(moneyOf(row), interState)?.taxable),
    },
    {
      header: "GST",
      width: 0.5,
      align: "right",
      render: (row) => (row.gst_pct === null ? "—" : formatPercent(row.gst_pct)),
    },
    {
      header: "Other",
      width: 0.65,
      align: "right",
      render: (row) => (row.other_charges ? formatAmount(row.other_charges) : "—"),
    },
    {
      header: "Amount",
      width: 1,
      align: "right",
      render: (row) => formatAmount(lineFigures(moneyOf(row), interState)?.total),
    },
  );
  return columns;
}

export function PoDocument({ data }: { data: PoPdfData }) {
  const { po, vendor, company } = data;
  const regime = gstRegime(po.vendor_gst_state, company?.state);
  const companyState = company?.state || DEFAULT_COMPANY_STATE;
  const totals = rollUpPo(po.lines.map(moneyOf), regime.interState);
  const isDraft = po.status === "draft";
  const showInvoiced = po.lines.some((line) => line.billed_quantity > 0);

  const meta: DocumentMeta = {
    documentType: "PURCHASE ORDER",
    reference: po.reference,
    footerLeft: `${po.project_name} · ${po.reference}`,
    isDraft,
    company,
  };

  const deliverTo =
    [po.deliver_store_name, po.deliver_note].filter(Boolean).join(" — ") || "As advised";

  return (
    <Document
      title={`Goodearth Purchase Order — ${po.reference}`}
      author="Goodearth"
      creator="Goodearth Toolbox"
    >
      <DocumentPage meta={meta}>
        <DocumentHeading
          title={po.reference}
          subtitle={[po.project_name, po.scope_name ?? "General", "Purchase Order"].join(" · ")}
        />

        <MetaBlock
          items={[
            { label: "Date", value: formatDate(po.issued_at ?? po.created_at) },
            { label: "Expected by", value: po.expected_by ? formatDate(po.expected_by) : "—" },
            { label: "Status", value: isDraft ? "DRAFT — not an order" : "Issued" },
            { label: "Lines", value: String(po.line_count) },
            { label: "Project", value: po.project_name },
            { label: "Location", value: po.scope_name ?? "General" },
            { label: "GST", value: regime.interState ? "IGST" : "CGST + SGST" },
            { label: "Raised by", value: po.created_by_name ?? "—" },
          ]}
        />

        <View style={styles.partyRow}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>To (Vendor)</Text>
            <Text style={styles.partyName}>{vendor.name}</Text>
            {vendor.contact_name && <Text style={styles.partyLine}>{vendor.contact_name}</Text>}
            {vendor.mobile && <Text style={styles.partyLine}>{vendor.mobile}</Text>}
            {vendor.address && <Text style={styles.partyLine}>{vendor.address}</Text>}
            {vendor.gst_no && <Text style={styles.partyLine}>GSTIN: {vendor.gst_no}</Text>}
            {po.vendor_gst_state && (
              <Text style={styles.partyLine}>State: {po.vendor_gst_state}</Text>
            )}
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Deliver to</Text>
            <Text style={styles.partyLine}>{deliverTo}</Text>
          </View>
        </View>

        <SectionLabel>Order lines</SectionLabel>
        <Text style={styles.currencyNote}>
          All amounts in Indian Rupees. A discount comes off before GST; other charges (freight,
          loading) are added after it.{" "}
          {regime.interState
            ? `GST is IGST: a supply from outside ${companyState}.`
            : `GST is CGST + SGST: a supply within ${companyState}.`}
        </Text>
        <DocumentTable columns={columnsFor(regime.interState, showInvoiced)} rows={po.lines} />

        <View style={styles.totalsBox} wrap={false}>
          {summaryRows(totals, regime.interState).map((row) => (
            <View key={row.label} style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{row.label}</Text>
              <Text style={styles.totalsValue}>{formatAmount(row.amount)}</Text>
            </View>
          ))}
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Grand total</Text>
            <Text style={styles.grandValue}>{formatAmount(totals.grand)}</Text>
          </View>
        </View>

        {/* Not kept whole: a full set of terms can run past one page. */}
        {po.terms && (
          <View>
            <SectionLabel>Terms and conditions</SectionLabel>
            <Text style={styles.termsText}>{po.terms}</Text>
          </View>
        )}

        <NotesBlock notes={[{ label: "Remarks", text: po.note }]} />

        {!isDraft && (
          <Signatures
            labels={[
              `For ${company?.legal_name || company?.name || "Goodearth"}`,
              "Vendor acknowledgement",
            ]}
          />
        )}
      </DocumentPage>
    </Document>
  );
}
