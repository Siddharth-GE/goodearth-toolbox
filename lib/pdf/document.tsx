import { Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { pdf } from "./theme";

/**
 * The shared shell every Goodearth document is built from.
 *
 * Selections uses it today; Purchase Orders, budget summaries and bills
 * will use the same letterhead, footer and table so the company's paper
 * looks like one system rather than one design per tool.
 *
 * On fonts: react-pdf embeds fonts rather than using the system's, and
 * Geist reaches this app as woff2 via next/font, which react-pdf can't
 * read. Helvetica is the built-in stand-in. Swap it by dropping a Geist
 * .ttf into the repo and calling Font.register here — one change, every
 * document follows.
 */

// react-pdf hyphenates by default, which broke narrow table headers
// mid-word ("RE- QUESTED"). Whole words only, in every document.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    fontFamily: pdf.font,
    fontSize: pdf.size.body,
    color: pdf.color.ink,
    paddingHorizontal: pdf.space.pageX,
    paddingTop: pdf.space.pageTop,
    paddingBottom: pdf.space.pageBottom,
  },

  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: pdf.color.ruleStrong,
    paddingBottom: 8,
    marginBottom: pdf.space.block,
  },
  wordmark: { fontFamily: pdf.fontBold, fontSize: pdf.size.title, letterSpacing: 1.5 },
  wordmarkRule: { color: pdf.color.accent },
  companyLine: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginTop: 2 },
  companyName: { fontFamily: pdf.fontBold, fontSize: pdf.size.title },
  companyBlock: { maxWidth: "62%" },
  docType: {
    fontFamily: pdf.fontBold,
    fontSize: pdf.size.small,
    letterSpacing: 1.2,
    textAlign: "right",
  },
  docRef: { fontSize: pdf.size.tiny, color: pdf.color.muted, textAlign: "right", marginTop: 2 },

  footer: {
    position: "absolute",
    left: pdf.space.pageX,
    right: pdf.space.pageX,
    bottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: pdf.color.rule,
    paddingTop: 5,
  },
  footerText: { fontSize: pdf.size.tiny, color: pdf.color.muted },

  watermark: {
    position: "absolute",
    top: "42%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: pdf.fontBold,
    fontSize: 92,
    letterSpacing: 12,
    color: pdf.color.draft,
    opacity: 0.1,
  },
});

export type DocumentMeta = {
  /** e.g. "SELECTIONS" — sits opposite the wordmark. */
  documentType: string;
  /** Stable reference, repeated on every page so a stray sheet is traceable. */
  reference: string;
  /** Appears bottom-left on every page. */
  footerLeft: string;
  /** Draft documents are watermarked and must never look signable. */
  isDraft?: boolean;
  /**
   * The company the document is issued by — its project's (0101). Absent
   * or null prints the placeholder letterhead.
   */
  company?: LetterheadCompany | null;
};

/** What the letterhead prints of a company; Masters' CompanyRow fits it. */
export type LetterheadCompany = {
  name: string;
  legal_name: string | null;
  address: string | null;
  gstin: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * Company identity block.
 *
 * With a company (Masters → Companies, through the document's project):
 * its legal name, registered address, GSTIN and contacts — never invented
 * here. Without one, the PLACEHOLDER: the wordmark set in type and a
 * stand-in line, as every document printed before companies existed.
 */
function Letterhead({
  documentType,
  reference,
  company,
}: {
  documentType: string;
  reference: string;
  company?: LetterheadCompany | null;
}) {
  // A typed address keeps its lines; the letterhead runs them into one,
  // whether or not each line already ended in a comma.
  const address = company?.address
    ?.split("\n")
    .map((part) => part.trim().replace(/,$/, ""))
    .filter(Boolean)
    .join(", ");
  const contacts = company
    ? [company.gstin && `GSTIN ${company.gstin}`, company.phone, company.email].filter(Boolean)
    : [];
  return (
    <View style={styles.letterhead} fixed>
      {company ? (
        <View style={styles.companyBlock}>
          <Text style={styles.companyName}>{company.legal_name || company.name}</Text>
          {address && <Text style={styles.companyLine}>{address}</Text>}
          {contacts.length > 0 && <Text style={styles.companyLine}>{contacts.join(" · ")}</Text>}
        </View>
      ) : (
        <View>
          <Text style={styles.wordmark}>
            GOODEARTH<Text style={styles.wordmarkRule}>.</Text>
          </Text>
          <Text style={styles.companyLine}>Kerala, India · goodearth.co.in</Text>
        </View>
      )}
      <View>
        <Text style={styles.docType}>{documentType}</Text>
        <Text style={styles.docRef}>{reference}</Text>
      </View>
    </View>
  );
}

/**
 * One A4 page. `fixed` on the letterhead and footer means they repeat on
 * every sheet a long space spills onto, without being re-declared.
 */
export function DocumentPage({ meta, children }: { meta: DocumentMeta; children: ReactNode }) {
  return (
    <Page size="A4" style={styles.page} wrap>
      {meta.isDraft && (
        <Text style={styles.watermark} fixed>
          DRAFT
        </Text>
      )}
      <Letterhead
        documentType={meta.documentType}
        reference={meta.reference}
        company={meta.company}
      />
      {children}
      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>{meta.footerLeft}</Text>
        <Text
          style={styles.footerText}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------
const tableStyles = StyleSheet.create({
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: pdf.color.ruleStrong,
    paddingBottom: 4,
    marginBottom: 2,
  },
  headCell: {
    fontFamily: pdf.fontBold,
    fontSize: pdf.size.sectionLabel,
    letterSpacing: 0.6,
    color: pdf.color.muted,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: pdf.color.rule,
    paddingVertical: 5,
  },
  cell: { fontSize: pdf.size.body, paddingRight: 6 },
  cellDetail: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginTop: 2, lineHeight: 1.3 },
});

export type Column<T> = {
  header: string;
  /** Flex weight, so columns stay proportional on any page width. */
  width: number;
  align?: "left" | "right";
  render: (row: T, index: number) => string;
  /** A smaller muted line under the cell's text — a description, a work. */
  detail?: (row: T, index: number) => string | null;
};

/**
 * A table that survives a page break: the header repeats on each sheet
 * (`fixed`), and rows are kept whole rather than split across pages.
 */
export function DocumentTable<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <View>
      <View style={tableStyles.headRow} fixed>
        {columns.map((column) => (
          <Text
            key={column.header}
            style={[
              tableStyles.headCell,
              { flex: column.width, textAlign: column.align ?? "left", paddingRight: 6 },
            ]}
          >
            {column.header}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={index} style={tableStyles.row} wrap={false}>
          {columns.map((column) => {
            const align = column.align ?? "left";
            const detail = column.detail?.(row, index);
            if (!detail) {
              return (
                <Text
                  key={column.header}
                  style={[tableStyles.cell, { flex: column.width, textAlign: align }]}
                >
                  {column.render(row, index)}
                </Text>
              );
            }
            return (
              <View key={column.header} style={{ flex: column.width, paddingRight: 6 }}>
                <Text style={[tableStyles.cell, { textAlign: align, paddingRight: 0 }]}>
                  {column.render(row, index)}
                </Text>
                <Text style={[tableStyles.cellDetail, { textAlign: align }]}>{detail}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------
// The blocks every chain document repeats — indent, PO, work order, bill
// ---------------------------------------------------------------------
const blockStyles = StyleSheet.create({
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
  metaItem: { width: "25%", paddingRight: 8, marginBottom: 6 },
  metaLabel: {
    fontSize: pdf.size.tiny,
    letterSpacing: 0.6,
    color: pdf.color.muted,
    textTransform: "uppercase",
  },
  metaValue: { fontSize: pdf.size.body, marginTop: 2 },
  sectionLabel: {
    fontFamily: pdf.fontBold,
    fontSize: pdf.size.sectionLabel,
    letterSpacing: 1,
    color: pdf.color.muted,
    textTransform: "uppercase",
    marginTop: pdf.space.block * 1.6,
    marginBottom: 6,
  },
  notes: {
    marginTop: pdf.space.block * 1.4,
    borderTopWidth: 0.5,
    borderTopColor: pdf.color.rule,
    paddingTop: 8,
  },
  notesText: { fontSize: pdf.size.tiny, color: pdf.color.muted, lineHeight: 1.5 },
  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  signatureBox: { width: "30%" },
  signatureRule: { borderTopWidth: 0.5, borderTopColor: pdf.color.ruleStrong, paddingTop: 4 },
  signatureLabel: { fontSize: pdf.size.tiny, color: pdf.color.muted },
});

/** The document's number, large, and what it is for, beneath. */
export function DocumentHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View>
      <Text style={blockStyles.h1}>{title}</Text>
      <Text style={blockStyles.subtitle}>{subtitle}</Text>
    </View>
  );
}

/** The shaded band of label-over-value facts, four to a row. */
export function MetaBlock({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View style={blockStyles.metaBlock}>
      {items.map((item) => (
        <View key={item.label} style={blockStyles.metaItem}>
          <Text style={blockStyles.metaLabel}>{item.label}</Text>
          <Text style={blockStyles.metaValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={blockStyles.sectionLabel}>{children}</Text>;
}

/** Terms, notes and remarks under a hairline — each a labelled paragraph. */
export function NotesBlock({ notes }: { notes: { label: string; text: string | null }[] }) {
  const shown = notes.filter((note) => note.text && note.text.trim() !== "");
  if (shown.length === 0) return null;
  return (
    <View style={blockStyles.notes}>
      {shown.map((note) => (
        <Text key={note.label} style={blockStyles.notesText}>
          {note.label}: {note.text}
        </Text>
      ))}
    </View>
  );
}

/** Signature lines, kept together at the foot. A draft prints none. */
export function Signatures({ labels }: { labels: string[] }) {
  return (
    <View style={blockStyles.signatureRow} wrap={false}>
      {labels.map((label) => (
        <View key={label} style={blockStyles.signatureBox}>
          <View style={blockStyles.signatureRule}>
            <Text style={blockStyles.signatureLabel}>{label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export { pdf, styles as documentStyles };
