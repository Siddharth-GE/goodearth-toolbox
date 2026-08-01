import { Document, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { DocumentPage, DocumentTable, type Column, type DocumentMeta } from "@/lib/pdf/document";
import { designView, formatAmount, formatDate, formatQty, pdf } from "@/lib/pdf/theme";
import type { QuoteData, QuoteLine, QuoteView } from "./quote";

/**
 * Document C — the client quote.
 *
 * The same data as the internal budget sheet, filtered: item, quantity,
 * rate and amount, with the design views above each space's list.
 *
 * It shows no cost and no margin, and it *cannot* — QuoteData (quote.ts)
 * has no field for either. That is a stronger guarantee than a template
 * that merely omits two columns, and it is the one worth having: showing
 * a client our cost is the single most expensive mistake this system
 * could make.
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

  summaryRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: pdf.color.rule,
    paddingVertical: 6,
  },
  grandRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: pdf.color.ruleStrong,
    paddingTop: 8,
    marginTop: 2,
  },
  grandLabel: { fontFamily: pdf.fontBold, fontSize: pdf.size.title, flex: 4 },
  grandValue: { fontFamily: pdf.fontBold, fontSize: pdf.size.title, flex: 2, textAlign: "right" },

  spaceHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  spaceName: { fontFamily: pdf.fontBold, fontSize: pdf.size.title },
  spaceType: { fontSize: pdf.size.small, color: pdf.color.muted, marginTop: 2 },

  viewGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14 },
  viewImage: { width: "100%", borderRadius: 2, objectFit: "cover" },
  viewCaption: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginTop: 3 },

  spaceTotal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    marginTop: 8,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: pdf.color.ruleStrong,
  },
  spaceTotalLabel: { fontSize: pdf.size.small, color: pdf.color.muted, marginRight: 12 },
  spaceTotalValue: { fontFamily: pdf.fontBold, fontSize: pdf.size.title },

  terms: { marginTop: pdf.space.block * 1.4, borderTopWidth: 0.5, borderTopColor: pdf.color.rule, paddingTop: 8 },
  termsText: { fontSize: pdf.size.tiny, color: pdf.color.muted, lineHeight: 1.5 },

  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  signatureBox: { width: "42%" },
  signatureRule: { borderTopWidth: 0.5, borderTopColor: pdf.color.ruleStrong, paddingTop: 4 },
  signatureLabel: { fontSize: pdf.size.tiny, color: pdf.color.muted },
});

/** Rate and amount only. There is no cost column because there is no cost. */
const columns: Column<QuoteLine>[] = [
  { header: "#", width: 0.4, render: (_row, index) => String(index + 1) },
  { header: "Item", width: 3.4, render: (row) => row.item_name },
  { header: "Brand", width: 1.4, render: (row) => row.item_brand ?? "—" },
  { header: "Qty", width: 0.7, align: "right", render: (row) => formatQty(row.quantity) },
  { header: "Unit", width: 0.7, render: (row) => row.uom },
  { header: "Rate", width: 1.1, align: "right", render: (row) => formatAmount(row.rate) },
  { header: "Amount", width: 1.3, align: "right", render: (row) => formatAmount(row.amount) },
];

export function QuoteDocument({ quote }: { quote: QuoteData }) {
  const meta: DocumentMeta = {
    documentType: "QUOTATION",
    reference: quote.reference,
    footerLeft: `${quote.project_name} · ${quote.unit_name} · ${quote.reference}`,
    isDraft: quote.isDraft,
  };

  return (
    <Document
      title={`Goodearth Quotation — ${quote.unit_name} R${quote.revision_no}`}
      author="Goodearth"
      creator="Goodearth Toolbox"
    >
      <DocumentPage meta={meta}>
        <Text style={styles.h1}>{quote.unit_name}</Text>
        <Text style={styles.subtitle}>{quote.project_name} · Quotation</Text>

        <View style={styles.metaBlock}>
          <Meta label="Reference" value={quote.reference} />
          <Meta label="Date" value={formatDate(quote.approved_at)} />
          <Meta label="Spaces" value={String(quote.spaces.length)} />
          <Meta
            label="Items"
            value={String(quote.spaces.reduce((sum, space) => sum + space.lines.length, 0))}
          />
        </View>

        <Text style={styles.sectionLabel}>Summary</Text>
        <Text style={styles.currencyNote}>All amounts in Indian Rupees.</Text>
        {quote.spaces.map((space, index) => (
          <View key={space.space_id} style={styles.summaryRow}>
            <Text style={{ flex: 0.4 }}>{index + 1}</Text>
            <Text style={{ flex: 3.6 }}>
              {space.label}
              <Text style={{ color: pdf.color.muted }}> · {space.space_type_name}</Text>
            </Text>
            <Text style={{ flex: 1, textAlign: "right", color: pdf.color.muted }}>
              {space.lines.length}
            </Text>
            <Text style={{ flex: 2, textAlign: "right" }}>{formatAmount(space.total)}</Text>
          </View>
        ))}
        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>Total</Text>
          <Text style={styles.grandValue}>{formatAmount(quote.total)}</Text>
        </View>

        <View style={styles.terms}>
          {/* PLACEHOLDER: the real commercial terms, GST treatment and
              validity period replace this when they arrive. One place. */}
          <Text style={styles.termsText}>
            Quantities are indicative and subject to final site measurement. Prices are exclusive of
            applicable taxes unless stated otherwise. This quotation is valid for 30 days from the
            date above.
          </Text>
        </View>

        {!quote.isDraft && (
          <View style={styles.signatureRow}>
            <View style={styles.signatureBox}>
              <View style={styles.signatureRule}>
                <Text style={styles.signatureLabel}>For Goodearth</Text>
              </View>
            </View>
            <View style={styles.signatureBox}>
              <View style={styles.signatureRule}>
                <Text style={styles.signatureLabel}>Client acceptance</Text>
              </View>
            </View>
          </View>
        )}
      </DocumentPage>

      {/* One sheet per space: the renders the client approved, then what
          those renders are made of, then what that space costs. */}
      {quote.spaces.map((space) => (
        <DocumentPage key={space.space_id} meta={meta}>
          <View style={styles.spaceHeading}>
            <View>
              <Text style={styles.spaceName}>{space.label}</Text>
              <Text style={styles.spaceType}>{space.space_type_name}</Text>
            </View>
            <Text style={{ fontSize: pdf.size.small, color: pdf.color.muted }}>
              {space.lines.length} {space.lines.length === 1 ? "item" : "items"}
            </Text>
          </View>

          <SpaceViewGrid views={space.views} />
          <DocumentTable columns={columns} rows={space.lines} />

          <View style={styles.spaceTotal}>
            <Text style={styles.spaceTotalLabel}>{space.label} total</Text>
            <Text style={styles.spaceTotalValue}>{formatAmount(space.total)}</Text>
          </View>
        </DocumentPage>
      ))}
    </Document>
  );
}

/** Identical layout rule to the design document — one view runs full
 *  width, several go two to a row — so the client sees the same pages
 *  they signed off, now with prices under them. */
function SpaceViewGrid({ views }: { views: QuoteView[] }) {
  if (views.length === 0) return null;
  const twoUp = views.length >= designView.twoUpFrom;

  return (
    <View style={styles.viewGrid}>
      {views.map((view, index) => (
        <View
          key={index}
          wrap={false}
          style={{
            width: twoUp ? "50%" : "100%",
            paddingRight: twoUp && index % 2 === 0 ? 6 : 0,
            paddingLeft: twoUp && index % 2 === 1 ? 6 : 0,
            marginBottom: 8,
          }}
        >
          {/* react-pdf's Image is a PDF primitive, not an <img>. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={{ data: view.data, format: "jpg" }} style={styles.viewImage} />
          {view.caption && <Text style={styles.viewCaption}>{view.caption}</Text>}
        </View>
      ))}
    </View>
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
