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
  type SignatureBox,
} from "@/lib/pdf/document";
import { pdf } from "@/lib/pdf/theme";
import { formatAmount, formatDate } from "@/lib/format";
import type { SheetBill, SheetDetail } from "./sheet-queries";
import { SHEET_STATE_LABEL } from "./sheets";

// A consolidated bill: one line per bill, the bills themselves printed apart. DRAFT until approved.

export type SheetPdfData = {
  sheet: SheetDetail;
  company: LetterheadCompany | null;
  /** Who signed it; null until approved, which prints no boxes. */
  signatures: SignatureBox[] | null;
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

const columns: Column<SheetBill>[] = [
  { header: "#", width: 0.4, render: (_row, index) => String(index + 1) },
  {
    header: "Bill",
    width: 2.4,
    render: (row) => row.reference,
    detail: (row) => (row.invoice_no && row.invoice_no !== row.reference ? row.invoice_no : null),
  },
  { header: "Villa", width: 2, render: (row) => row.place, detail: (row) => row.project_name },
  { header: "Date", width: 1.2, render: (row) => formatDate(row.invoice_date) },
  { header: "Amount", width: 1.3, align: "right", render: (row) => formatAmount(row.total) },
];

export function SheetDocument({ data }: { data: SheetPdfData }) {
  return (
    <Document
      title={`Goodearth Consolidated Bill — ${data.sheet.reference}`}
      author="Goodearth"
      creator="Kaadal Toolbox"
    >
      <SheetPage data={data} />
    </Document>
  );
}

export function SheetPage({ data }: { data: SheetPdfData }) {
  const { sheet } = data;
  const isDraft = sheet.status !== "approved";
  const party =
    sheet.vendor_name + (sheet.vendor_contractor_no ? ` (${sheet.vendor_contractor_no})` : "");
  const meta: DocumentMeta = {
    documentType: "CONSOLIDATED BILL",
    reference: `${sheet.reference} · ${party}`,
    footerLeft: `${sheet.company_name} · ${sheet.reference} · ${party}`,
    isDraft,
    company: data.company,
  };

  return (
    <DocumentPage meta={meta}>
      <DocumentHeading
        title={`${sheet.reference} — ${party}`}
        subtitle={[
          sheet.company_name,
          `${sheet.bills.length} ${sheet.bills.length === 1 ? "bill" : "bills"}`,
          sheet.work_type === "PW" ? "Piece-work" : "Daily wages (NMR)",
        ].join(" · ")}
      />

      <MetaBlock
        items={[
          {
            label: "Status",
            value: isDraft ? "DRAFT — not approved" : SHEET_STATE_LABEL[sheet.state],
          },
          { label: "Made by", value: sheet.created_by_name ?? "—" },
          { label: "Approved by", value: sheet.approved_by_name ?? "—" },
          { label: "Paid", value: formatAmount(sheet.paid + sheet.recovered) },
          { label: "Pending", value: formatAmount(sheet.pending) },
        ]}
      />

      <SectionLabel>Bills</SectionLabel>
      <Text style={styles.currencyNote}>All amounts in Indian Rupees.</Text>
      <DocumentTable columns={columns} rows={sheet.bills} />

      <View style={styles.totalsBox}>
        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>Total</Text>
          <Text style={styles.grandValue}>{formatAmount(sheet.total)}</Text>
        </View>
        {sheet.paid + sheet.recovered > 0 && (
          <>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Paid</Text>
              <Text style={styles.totalsValue}>{formatAmount(sheet.paid)}</Text>
            </View>
            {sheet.recovered !== 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Recovered from advances</Text>
                <Text style={styles.totalsValue}>{formatAmount(sheet.recovered)}</Text>
              </View>
            )}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Pending</Text>
              <Text style={styles.totalsValue}>{formatAmount(sheet.pending)}</Text>
            </View>
          </>
        )}
      </View>

      <NotesBlock notes={[{ label: "Sent back", text: isDraft ? sheet.sent_back_note : null }]} />

      {!isDraft && (
        <Signatures
          labels={[...(data.signatures ?? ["Prepared by", "Approved by"]), `Received — ${party}`]}
        />
      )}
    </DocumentPage>
  );
}
