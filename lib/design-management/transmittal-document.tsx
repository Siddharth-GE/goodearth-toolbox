import { Document, StyleSheet, Text, View } from "@react-pdf/renderer";
import { DocumentPage, DocumentTable, type Column, type DocumentMeta } from "@/lib/pdf/document";
import { pdf } from "@/lib/pdf/theme";
import { formatDate } from "@/lib/format";
import type { TransmittalDetail, TransmittalLineRow } from "./queries";

/**
 * The transmittal cover sheet — one page, on the company letterhead.
 *
 * It is a COVER SHEET and not the drawings: the sheets themselves are
 * PDFs, react-pdf embeds only images, and a transmittal is forwarded by
 * hand with the drawing files attached beside it (founder decision,
 * plan.md). What this page has to answer is "which drawings, at which
 * revision, went out on which date, at which design stage" — so it
 * lists them and counts their files rather than reproducing them.
 *
 * No money anywhere, because this tool has none.
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
  metaItem: { width: "25%", paddingRight: 8, marginBottom: 4 },
  metaLabel: {
    fontSize: pdf.size.tiny,
    letterSpacing: 0.6,
    color: pdf.color.muted,
    textTransform: "uppercase",
  },
  metaValue: { fontSize: pdf.size.body, marginTop: 2 },

  noteBlock: {
    marginTop: pdf.space.block,
    borderLeftWidth: 2,
    borderLeftColor: pdf.color.accent,
    paddingLeft: 10,
  },
  noteLabel: {
    fontSize: pdf.size.tiny,
    letterSpacing: 0.6,
    color: pdf.color.muted,
    textTransform: "uppercase",
  },
  noteText: { fontSize: pdf.size.body, marginTop: 3, lineHeight: 1.5 },

  sectionLabel: {
    fontFamily: pdf.fontBold,
    fontSize: pdf.size.sectionLabel,
    letterSpacing: 1,
    color: pdf.color.muted,
    textTransform: "uppercase",
    marginTop: pdf.space.block * 1.6,
    marginBottom: 6,
  },

  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 44 },
  signatureBox: { width: "42%" },
  signatureRule: { borderTopWidth: 0.5, borderTopColor: pdf.color.ruleStrong, paddingTop: 4 },
  signatureLabel: { fontSize: pdf.size.tiny, color: pdf.color.muted },
});

/** Sheet order — the same order the screen lists the lines in. */
const columns: Column<TransmittalLineRow>[] = [
  { header: "#", width: 0.4, render: (_row, index) => String(index + 1) },
  { header: "Code", width: 1.1, render: (row) => row.setCode ?? "—" },
  { header: "Drawing set", width: 3.2, render: (row) => row.setName },
  { header: "Rev", width: 0.6, render: (row) => `R${row.revisionNo}` },
  { header: "What changed", width: 3.2, render: (row) => row.revisionNote ?? "" },
  {
    header: "Sheets",
    width: 0.7,
    align: "right",
    render: (row) => String(row.files.length),
  },
];

export function TransmittalDocument({ transmittal }: { transmittal: TransmittalDetail }) {
  const isDraft = transmittal.status !== "issued";
  // A draft has no number at all — 0091 refuses to let one hold a
  // number before it is issued — so the reference says so in words and
  // the watermark says it again across the page.
  const reference = transmittal.number ?? "Draft";

  const meta: DocumentMeta = {
    documentType: "TRANSMITTAL",
    reference,
    footerLeft: `${transmittal.projectName} · ${transmittal.villaName} · ${transmittal.stageName}`,
    isDraft,
  };

  return (
    <Document
      title={`Goodearth Transmittal — ${reference} — ${transmittal.villaName}`}
      author="Goodearth"
      creator="Goodearth Toolbox"
    >
      <DocumentPage meta={meta}>
        <Text style={styles.h1}>{transmittal.villaName}</Text>
        <Text style={styles.subtitle}>
          {transmittal.projectName} · Drawings issued for {transmittal.stageName}
        </Text>

        <View style={styles.metaBlock}>
          <Meta label="Transmittal" value={reference} />
          <Meta label="Villa" value={transmittal.villaName} />
          <Meta label="Plot" value={transmittal.plotName} />
          <Meta label="Project" value={transmittal.projectName} />
          <Meta label="Design stage" value={transmittal.stageName} />
          <Meta
            label="Issued"
            value={transmittal.issuedAt ? formatDate(transmittal.issuedAt) : "Not issued"}
          />
          <Meta label="Issued by" value={transmittal.issuedByName ?? "—"} />
          <Meta label="Drawings" value={String(transmittal.lines.length)} />
        </View>

        {transmittal.note && (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Note</Text>
            <Text style={styles.noteText}>{transmittal.note}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Drawings on this transmittal</Text>
        <DocumentTable columns={columns} rows={transmittal.lines} />

        {/* Only an issued transmittal is something anyone signs for — a
            draft must never look like a receipt. */}
        {!isDraft && (
          <View style={styles.signatureRow}>
            <View style={styles.signatureBox}>
              <View style={styles.signatureRule}>
                <Text style={styles.signatureLabel}>Issued by, for Goodearth</Text>
              </View>
            </View>
            <View style={styles.signatureBox}>
              <View style={styles.signatureRule}>
                <Text style={styles.signatureLabel}>Received at site</Text>
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
