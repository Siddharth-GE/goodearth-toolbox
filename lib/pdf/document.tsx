import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";
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
};

/**
 * Company identity block.
 *
 * PLACEHOLDER: the wordmark is set in type and the address line is a
 * stand-in. Swap for the real logo, registered address and GST number
 * when those assets arrive — this is the only place they appear.
 */
function Letterhead({ documentType, reference }: { documentType: string; reference: string }) {
  return (
    <View style={styles.letterhead} fixed>
      <View>
        <Text style={styles.wordmark}>
          GOODEARTH<Text style={styles.wordmarkRule}>.</Text>
        </Text>
        <Text style={styles.companyLine}>Kerala, India · goodearth.co.in</Text>
      </View>
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
      <Letterhead documentType={meta.documentType} reference={meta.reference} />
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
});

export type Column<T> = {
  header: string;
  /** Flex weight, so columns stay proportional on any page width. */
  width: number;
  align?: "left" | "right";
  render: (row: T, index: number) => string;
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
          {columns.map((column) => (
            <Text
              key={column.header}
              style={[tableStyles.cell, { flex: column.width, textAlign: column.align ?? "left" }]}
            >
              {column.render(row, index)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export { pdf, styles as documentStyles };
