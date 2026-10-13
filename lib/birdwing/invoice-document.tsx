import { Document, StyleSheet, Text, View } from "@react-pdf/renderer";
import { amountInWords, formatAmount, formatDate, formatQuantity } from "@/lib/format";
import {
  DocumentHeading,
  DocumentPage,
  DocumentTable,
  MetaBlock,
  NotesBlock,
  SectionLabel,
  Signatures,
  type Column,
} from "@/lib/pdf/document";
import { pdf } from "@/lib/pdf/theme";
import type { InvoiceLine, InvoicePrint } from "./invoice";
import { nightsBetween } from "./money";

/**
 * A Birdwing tax invoice on the shared paper (lib/pdf/document.tsx): the
 * invoicing company's letterhead from Masters (never typed here, never
 * invented — PRODUCT.md), the MEF/GH number, the stay, the lines with SAC
 * and GST, the tax summary split CGST + SGST, the total in words, and the
 * bank, UPI and cancellation policy from Birdwing → Settings.
 *
 * Amounts in digits to the paisa (Helvetica has no ₹ glyph; the currency
 * is said once). A draft is watermarked and unsigned; a cancelled invoice
 * says CANCELLED where the number is.
 */

const styles = StyleSheet.create({
  currencyNote: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginBottom: 6 },
  totalsBox: { alignSelf: "flex-end", width: "48%", marginTop: 10 },
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
  words: { fontSize: pdf.size.small, marginTop: 8, textAlign: "right" },
  cancelled: {
    fontFamily: pdf.fontBold,
    fontSize: pdf.size.small,
    color: pdf.color.draft,
    marginTop: 6,
  },
  payBlock: { flexDirection: "row", gap: 16, marginTop: 4 },
  payColumn: { flex: 1 },
  payText: { fontSize: pdf.size.small, lineHeight: 1.5 },
});

const paise = (value: number) => formatAmount(value, { paise: true });

const LINE_COLUMNS: Column<InvoiceLine>[] = [
  { header: "#", width: 0.4, render: (_line, index) => String(index + 1) },
  {
    header: "Description",
    width: 3.4,
    render: (line) => line.head,
    detail: (line) => line.description,
  },
  { header: "SAC", width: 1, render: (line) => line.sac ?? "—" },
  { header: "Qty", width: 0.8, align: "right", render: (line) => formatQuantity(line.qty) },
  {
    header: "Rate",
    width: 1.3,
    align: "right",
    render: (line) => paise(line.rate),
    detail: (line) => (line.rateIncludesGst ? "incl. GST" : null),
  },
  {
    header: "GST",
    width: 0.8,
    align: "right",
    render: (line) => `${formatQuantity(line.gstPct)}%`,
  },
  { header: "Taxable", width: 1.4, align: "right", render: (line) => paise(line.taxable) },
  { header: "Amount", width: 1.4, align: "right", render: (line) => paise(line.amount) },
];

const TAX_COLUMNS: Column<InvoicePrint["taxSummary"][number]>[] = [
  { header: "GST rate", width: 1, render: (row) => `${formatQuantity(row.gstPct)}%` },
  { header: "Taxable value", width: 1.5, align: "right", render: (row) => paise(row.taxable) },
  { header: "CGST", width: 1.2, align: "right", render: (row) => paise(row.cgst) },
  { header: "SGST", width: 1.2, align: "right", render: (row) => paise(row.sgst) },
  { header: "Total", width: 1.5, align: "right", render: (row) => paise(row.amount) },
];

export function InvoiceDocument({ invoice }: { invoice: InvoicePrint }) {
  const draft = invoice.mode === "draft";
  const company = invoice.company;
  const issuer = company?.legal_name || company?.name || null;
  const nights = invoice.stay.arrival
    ? nightsBetween(invoice.stay.arrival, invoice.stay.departure)
    : 0;

  return (
    <Document title={invoice.number ?? `Draft invoice ${invoice.stay.ref}`}>
      <DocumentPage
        meta={{
          documentType: draft ? "INVOICE · DRAFT" : "TAX INVOICE",
          reference: invoice.number ?? invoice.stay.ref,
          footerLeft: `Birdwing Farmstay · ${invoice.stay.ref}`,
          isDraft: draft,
          company,
        }}
      >
        <DocumentHeading
          title={invoice.number ?? "Draft invoice"}
          subtitle={`Birdwing Farmstay · stay ${invoice.stay.ref}`}
        />
        {invoice.mode === "cancelled" && (
          <Text style={styles.cancelled}>
            CANCELLED{invoice.cancelReason ? ` — ${invoice.cancelReason}` : ""}
          </Text>
        )}

        <MetaBlock
          items={[
            { label: "Invoice date", value: invoice.issuedOn ? formatDate(invoice.issuedOn) : "—" },
            { label: "Billed to", value: invoice.billTo.name || "—" },
            { label: "Their GSTIN", value: invoice.billTo.gstin ?? "—" },
            { label: "Place of supply", value: invoice.placeOfSupply ?? "—" },
            {
              label: "Stay",
              value: invoice.stay.arrival
                ? `${formatDate(invoice.stay.arrival)} – ${formatDate(invoice.stay.departure)}`
                : "—",
            },
            { label: "Nights", value: nights ? String(nights) : "Day visit" },
            { label: "Guests", value: invoice.stay.guests ? String(invoice.stay.guests) : "—" },
            { label: "Issued by", value: issuer ?? "—" },
          ]}
        />
        {invoice.billTo.address && (
          <NotesBlock notes={[{ label: "Billing address", text: invoice.billTo.address }]} />
        )}

        <SectionLabel>Charges</SectionLabel>
        <Text style={styles.currencyNote}>All amounts in Indian rupees.</Text>
        <DocumentTable columns={LINE_COLUMNS} rows={invoice.lines} />

        <View style={styles.totalsBox} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Taxable value</Text>
            <Text style={styles.totalsValue}>{paise(invoice.taxable)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>CGST</Text>
            <Text style={styles.totalsValue}>{paise(invoice.cgst)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>SGST</Text>
            <Text style={styles.totalsValue}>{paise(invoice.sgst)}</Text>
          </View>
          {invoice.discount > 0 && (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Total</Text>
                <Text style={styles.totalsValue}>{paise(invoice.total)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Less discount</Text>
                <Text style={styles.totalsValue}>{paise(invoice.discount)}</Text>
              </View>
            </>
          )}
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Amount payable</Text>
            <Text style={styles.grandValue}>{paise(invoice.payable)}</Text>
          </View>
          <Text style={styles.words}>{amountInWords(invoice.payable)}</Text>
        </View>

        {invoice.taxSummary.length > 0 && (
          <>
            <SectionLabel>Tax summary</SectionLabel>
            <DocumentTable columns={TAX_COLUMNS} rows={invoice.taxSummary} />
          </>
        )}

        {(invoice.bankDetails || invoice.upiId) && (
          <>
            <SectionLabel>Payment</SectionLabel>
            <View style={styles.payBlock} wrap={false}>
              {invoice.bankDetails && (
                <View style={styles.payColumn}>
                  <Text style={styles.payText}>{invoice.bankDetails}</Text>
                </View>
              )}
              {invoice.upiId && (
                <View style={styles.payColumn}>
                  <Text style={styles.payText}>UPI: {invoice.upiId}</Text>
                </View>
              )}
            </View>
          </>
        )}

        <NotesBlock notes={[{ label: "Terms", text: invoice.terms }]} />

        {!draft && issuer && <Signatures labels={[`For ${issuer} — authorised signatory`]} />}
      </DocumentPage>
    </Document>
  );
}
