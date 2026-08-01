import { Document, StyleSheet, Text, View } from "@react-pdf/renderer";
import { DocumentPage, DocumentTable, type Column, type DocumentMeta } from "@/lib/pdf/document";
import { formatAmount, formatDate, formatQty, pdf } from "@/lib/pdf/theme";
import type { BudgetDetail, BudgetLineRow } from "./queries";
import { lineAmount, lineCost } from "./math";

/**
 * Document B — the internal budget sheet.
 *
 * INTERNAL ONLY. This is the one document in the system that shows cost
 * and margin side by side. It is marked as such on every page, because the
 * difference between this and the client quote is one careless email.
 *
 * The client quote (document C) is deliberately built from a different
 * data type in quote.ts — one with no cost or margin fields at all —
 * rather than from this same shape with columns hidden. Hidden columns can
 * be un-hidden by a mistake; absent fields cannot.
 */

const styles = StyleSheet.create({
  h1: { fontFamily: pdf.fontBold, fontSize: pdf.size.display, letterSpacing: -0.3 },
  subtitle: { fontSize: pdf.size.body, color: pdf.color.muted, marginTop: 3 },

  confidential: {
    marginTop: pdf.space.block,
    borderWidth: 0.5,
    borderColor: pdf.color.draft,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  confidentialText: {
    fontFamily: pdf.fontBold,
    fontSize: pdf.size.small,
    letterSpacing: 0.8,
    color: pdf.color.draft,
    textTransform: "uppercase",
  },
  confidentialNote: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginTop: 2 },

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

  summaryRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: pdf.color.rule,
    paddingVertical: 5,
  },
  grandRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: pdf.color.ruleStrong,
    paddingTop: 6,
    marginTop: 2,
  },
  grandCell: { fontFamily: pdf.fontBold, fontSize: pdf.size.body },

  spaceHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  spaceName: { fontFamily: pdf.fontBold, fontSize: pdf.size.title },
  spaceType: { fontSize: pdf.size.small, color: pdf.color.muted, marginTop: 2 },

  spaceTotal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: pdf.color.ruleStrong,
  },
  spaceTotalLabel: { fontSize: pdf.size.small, color: pdf.color.muted, marginRight: 12 },
  spaceTotalValue: { fontFamily: pdf.fontBold, fontSize: pdf.size.body },

  currencyNote: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginBottom: 6 },
});

/** Cost and margin appear here and nowhere else in the system's output. */
const columns: Column<BudgetLineRow>[] = [
  { header: "#", width: 0.4, render: (_row, index) => String(index + 1) },
  { header: "Code", width: 1.1, render: (row) => row.item_code ?? "—" },
  { header: "Item", width: 2.6, render: (row) => row.item_name },
  { header: "Qty", width: 0.6, align: "right", render: (row) => formatQty(row.quantity) },
  { header: "Unit", width: 0.6, render: (row) => row.uom },
  { header: "Cost", width: 0.9, align: "right", render: (row) => formatAmount(row.unit_cost) },
  {
    header: "Cost total",
    width: 1.1,
    align: "right",
    render: (row) => formatAmount(lineCost(row)),
  },
  {
    header: "Margin",
    width: 0.7,
    align: "right",
    render: (row) => (row.margin_pct === null ? "—" : `${formatQty(row.margin_pct)}%`),
  },
  { header: "Rate", width: 0.9, align: "right", render: (row) => formatAmount(row.client_rate) },
  {
    header: "Amount",
    width: 1.1,
    align: "right",
    render: (row) => formatAmount(lineAmount(row)),
  },
];

export function BudgetDocument({ budget }: { budget: BudgetDetail }) {
  const isDraft = budget.status === "pricing";
  // R-number = what was designed. Version = which pricing of it. Both are
  // needed: re-opening an approved budget to fix a rate produces a second
  // document against the same design.
  const reference = `BUD/${budget.unit_name}/R${budget.revision_no}-V${budget.version}`
    .toUpperCase()
    .replace(/\s+/g, "");

  const meta: DocumentMeta = {
    documentType: "BUDGET · INTERNAL",
    reference,
    footerLeft: `INTERNAL — not for client circulation · ${budget.unit_name} R${budget.revision_no}-v${budget.version}`,
    // A budget still being priced is watermarked DRAFT: its totals are
    // incomplete, and nobody should mistake it for a settled figure.
    isDraft,
  };

  return (
    <Document
      title={`Goodearth Budget (Internal) — ${budget.unit_name} R${budget.revision_no}`}
      author="Goodearth"
      creator="Goodearth Toolbox"
    >
      <DocumentPage meta={meta}>
        <Text style={styles.h1}>{budget.unit_name}</Text>
        <Text style={styles.subtitle}>
          {budget.project_name} · Budget v{budget.version} against Selections R{budget.revision_no}
        </Text>

        <View style={styles.confidential}>
          <Text style={styles.confidentialText}>Internal — contains cost and margin</Text>
          <Text style={styles.confidentialNote}>
            The client quote is a separate document and shows neither. Do not forward this one.
          </Text>
        </View>

        <View style={styles.metaBlock}>
          <Meta label="Design revision" value={`R${budget.revision_no}`} />
          <Meta label="Budget version" value={`v${budget.version}`} />
          <Meta label="Status" value={isDraft ? "Pricing in progress" : "Approved"} />
          <Meta label="Approved" value={formatDate(budget.approved_at)} />
          <Meta label="Reference" value={reference} />
          <Meta label="Spaces" value={String(budget.spaces.length)} />
          <Meta label="Lines" value={String(budget.totals.lineCount)} />
          <Meta
            label="Priced"
            value={`${budget.totals.pricedCount} of ${budget.totals.lineCount}`}
          />
          <Meta
            label="Blended margin"
            value={
              budget.totals.marginPct === null ? "—" : `${budget.totals.marginPct.toFixed(1)}%`
            }
          />
        </View>

        {budget.totals.pendingCount > 0 && (
          <Text style={{ fontSize: pdf.size.small, color: pdf.color.draft, marginTop: 10 }}>
            {budget.totals.pendingCount} of {budget.totals.lineCount} lines have no cost yet — the
            totals below are incomplete.
          </Text>
        )}

        <Text style={styles.sectionLabel}>Summary by space</Text>
        <Text style={styles.currencyNote}>All amounts in Indian Rupees.</Text>
        {budget.spaces.map((space, index) => (
          <View key={space.space_id} style={styles.summaryRow}>
            <Text style={{ flex: 0.4 }}>{index + 1}</Text>
            <Text style={{ flex: 3 }}>{space.label}</Text>
            <Text style={{ flex: 1, textAlign: "right", color: pdf.color.muted }}>
              {space.totals.lineCount}
            </Text>
            <Text style={{ flex: 1.4, textAlign: "right" }}>{formatAmount(space.totals.cost)}</Text>
            <Text style={{ flex: 1.4, textAlign: "right" }}>
              {formatAmount(space.totals.margin)}
            </Text>
            <Text style={{ flex: 1.6, textAlign: "right" }}>
              {formatAmount(space.totals.client)}
            </Text>
          </View>
        ))}
        <View style={styles.grandRow}>
          <Text style={[styles.grandCell, { flex: 3.4 }]}>Total</Text>
          <Text style={[styles.grandCell, { flex: 1, textAlign: "right" }]}>
            {budget.totals.lineCount}
          </Text>
          <Text style={[styles.grandCell, { flex: 1.4, textAlign: "right" }]}>
            {formatAmount(budget.totals.cost)}
          </Text>
          <Text style={[styles.grandCell, { flex: 1.4, textAlign: "right" }]}>
            {formatAmount(budget.totals.margin)}
          </Text>
          <Text style={[styles.grandCell, { flex: 1.6, textAlign: "right" }]}>
            {formatAmount(budget.totals.client)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", marginTop: 3 }}>
          <Text style={{ flex: 3.4 }} />
          <Text style={{ flex: 1 }} />
          <Text style={[styles.metaLabel, { flex: 1.4, textAlign: "right" }]}>Cost</Text>
          <Text style={[styles.metaLabel, { flex: 1.4, textAlign: "right" }]}>Margin</Text>
          <Text style={[styles.metaLabel, { flex: 1.6, textAlign: "right" }]}>Client</Text>
        </View>
      </DocumentPage>

      {/* One sheet per space, same as the design document, so the two can
          be read side by side. */}
      {budget.spaces.map((space) => (
        <DocumentPage key={space.space_id} meta={meta}>
          <View style={styles.spaceHeading}>
            <View>
              <Text style={styles.spaceName}>{space.label}</Text>
              <Text style={styles.spaceType}>{space.space_type_name}</Text>
            </View>
            <Text style={{ fontSize: pdf.size.small, color: pdf.color.muted }}>
              {space.totals.lineCount} {space.totals.lineCount === 1 ? "line" : "lines"}
              {space.totals.pendingCount > 0 && ` · ${space.totals.pendingCount} unpriced`}
            </Text>
          </View>

          <DocumentTable columns={columns} rows={space.lines} />

          <View style={styles.spaceTotal}>
            <Text style={styles.spaceTotalLabel}>Cost</Text>
            <Text style={[styles.spaceTotalValue, { marginRight: 18 }]}>
              {formatAmount(space.totals.cost)}
            </Text>
            <Text style={styles.spaceTotalLabel}>Client</Text>
            <Text style={styles.spaceTotalValue}>{formatAmount(space.totals.client)}</Text>
          </View>
        </DocumentPage>
      ))}
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
