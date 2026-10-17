import { Document, Link, StyleSheet, Text, View } from "@react-pdf/renderer";
import { DocumentPage, DocumentTable, type Column, type DocumentMeta } from "@/lib/pdf/document";
import { pdf } from "@/lib/pdf/theme";
import { formatDate } from "@/lib/format";
import type { TransmittalDetail, TransmittalLineRow } from "./queries";

/**
 * A COVER SHEET, not the drawings: since 0124 the drawings are a WorkDrive folder, printed as its link. It answers which drawings, at which revision, went out when, at which stage,
 * so after the set and revision it lists every sheet by name; a forty-sheet set runs onto a second page with the header repeating. No money.
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
  metaItemWide: { width: "50%", paddingRight: 8, marginBottom: 4 },
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
  link: { fontSize: pdf.size.body, marginTop: 3, color: pdf.color.accent },

  sectionLabel: {
    fontFamily: pdf.fontBold,
    fontSize: pdf.size.sectionLabel,
    letterSpacing: 1,
    color: pdf.color.muted,
    textTransform: "uppercase",
    marginTop: pdf.space.block * 1.6,
    marginBottom: 6,
  },
  empty: { fontSize: pdf.size.body, color: pdf.color.muted },

  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 44 },
  signatureBox: { width: "42%" },
  signatureRule: { borderTopWidth: 0.5, borderTopColor: pdf.color.ruleStrong, paddingTop: 4 },
  signatureLabel: { fontSize: pdf.size.tiny, color: pdf.color.muted },
});

type SheetRow = { set: string; name: string; detail: string };

function sheetRows(line: TransmittalLineRow): SheetRow[] {
  const set = `${line.setName} · R${line.revisionNo}`;
  if (line.folderSheets.length > 0) {
    return line.folderSheets.map((sheet) => ({
      set,
      name: sheet.name,
      detail: sheet.modifiedAt ? formatDate(sheet.modifiedAt) : "",
    }));
  }
  return line.files.map((file) => ({ set, name: file.fileName, detail: file.sheetCode ?? "" }));
}

export function TransmittalDocument({ transmittal }: { transmittal: TransmittalDetail }) {
  const isDraft = transmittal.status !== "issued";
  // A draft has no number (0091 refuses one before issue), so the reference and the watermark say so in words.
  const reference = transmittal.number ?? "Draft";
  const rows = transmittal.lines.flatMap(sheetRows);
  // One line since 0099; a transmittal from before may carry several sets.
  const line = transmittal.lines.length === 1 ? transmittal.lines[0]! : null;
  const fromFolders = transmittal.lines.some((row) => row.folderSheets.length > 0);
  const links = transmittal.lines.filter((row) => row.drawingsUrl);

  const columns: Column<SheetRow>[] = [
    { header: "#", width: 0.4, render: (_row, index) => String(index + 1) },
    ...(line ? [] : [{ header: "Drawing set", width: 2.2, render: (row: SheetRow) => row.set }]),
    { header: "Sheet", width: 6, render: (row) => row.name },
    {
      header: fromFolders ? "Last changed" : "Code",
      width: 1.3,
      align: "right",
      render: (row) => row.detail,
    },
  ];

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
      creator="Toolbox by Kaadal"
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
          {line && <Meta label="Drawing set" value={line.setName} wide />}
          {line && <Meta label="Revision" value={`R${line.revisionNo}`} />}
          <Meta label="Design stage" value={transmittal.stageName} />
          <Meta
            label="Issued"
            value={transmittal.issuedAt ? formatDate(transmittal.issuedAt) : "Not issued"}
          />
          <Meta label="Issued by" value={transmittal.issuedByName ?? "—"} />
          <Meta label="Sheets" value={rows.length > 0 ? String(rows.length) : "—"} />
        </View>

        {line?.revisionNote && (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>
              {line.revisionNo === 0 ? "About this issue" : "What changed"}
            </Text>
            <Text style={styles.noteText}>{line.revisionNote}</Text>
          </View>
        )}

        {transmittal.note && (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Note for site</Text>
            <Text style={styles.noteText}>{transmittal.note}</Text>
          </View>
        )}

        {links.map((row) => (
          <View key={row.lineId} style={styles.noteBlock} wrap={false}>
            <Text style={styles.noteLabel}>
              {line ? "Drawings — WorkDrive" : `${row.setName} — WorkDrive`}
            </Text>
            <Link src={row.drawingsUrl!} style={styles.link}>
              {row.drawingsUrl}
            </Link>
          </View>
        ))}

        <Text style={styles.sectionLabel}>Sheets on this transmittal</Text>
        {rows.length > 0 ? (
          <DocumentTable columns={columns} rows={rows} />
        ) : (
          <Text style={styles.empty}>
            {links.length > 0
              ? "The sheets are in the WorkDrive folder above; no list of them was kept."
              : "No sheets were recorded."}
          </Text>
        )}

        {/* Only an issued transmittal is signed for; a draft must never look like a receipt. */}
        {!isDraft && (
          <View style={styles.signatureRow} wrap={false}>
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

function Meta({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={wide ? styles.metaItemWide : styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}
