import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { Document } from "@react-pdf/renderer";
import { DocumentPage, DocumentTable, type Column, type DocumentMeta } from "@/lib/pdf/document";
import { designView, pdf } from "@/lib/pdf/theme";
import { formatDate, formatQuantity } from "@/lib/format";
import type { BudgetHandoff, SelectionLineRow } from "./queries";

/** One space per sheet: a sheet is what someone carries into a room. No rates, totals or value of any kind: costs belong to Budgets' document. */

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

  contentsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: pdf.color.rule,
    paddingVertical: 5,
  },

  spaceHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  spaceName: { fontFamily: pdf.fontBold, fontSize: pdf.size.title },
  spaceType: { fontSize: pdf.size.small, color: pdf.color.muted, marginTop: 2 },
  spaceCount: { fontSize: pdf.size.small, color: pdf.color.muted },

  viewGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14 },
  viewImage: { width: "100%", borderRadius: 2, objectFit: "cover" },
  viewCaption: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginTop: 3 },

  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 44 },
  signatureBox: { width: "42%" },
  signatureRule: { borderTopWidth: 0.5, borderTopColor: pdf.color.ruleStrong, paddingTop: 4 },
  signatureLabel: { fontSize: pdf.size.tiny, color: pdf.color.muted },
});

const columns: Column<SelectionLineRow>[] = [
  { header: "#", width: 0.45, render: (_row, index) => String(index + 1) },
  { header: "Code", width: 1.15, render: (row) => row.item_code ?? "—" },
  { header: "Item", width: 3.2, render: (row) => row.item_name },
  { header: "Brand", width: 1.5, render: (row) => row.item_brand ?? "—" },
  { header: "Qty", width: 0.7, align: "right", render: (row) => formatQuantity(row.quantity) },
  { header: "Unit", width: 0.7, render: (row) => row.uom },
  { header: "Notes", width: 2.4, render: (row) => row.designer_note ?? "" },
];

/** The bucket is private, so views arrive as bytes. */
export type ViewImage = { data: Buffer; caption: string | null };

export function SelectionDocument({
  handoff,
  viewsBySpace = new Map(),
}: {
  handoff: BudgetHandoff;
  viewsBySpace?: Map<string, ViewImage[]>;
}) {
  const { selection, spaces, totalLines } = handoff;
  const isDraft = selection.status === "draft";

  const reference = `SEL/${selection.unit_name}/R${selection.revision_no}`
    .toUpperCase()
    .replace(/\s+/g, "");

  const meta: DocumentMeta = {
    documentType: "SELECTIONS",
    reference,
    footerLeft: `${selection.project_name} · ${selection.unit_name} · R${selection.revision_no}`,
    isDraft,
  };

  return (
    <Document
      title={`Goodearth Selections — ${selection.unit_name} R${selection.revision_no}`}
      author="Goodearth"
      creator="Kaadal Toolbox"
    >
      <DocumentPage meta={meta}>
        <Text style={styles.h1}>{selection.unit_name}</Text>
        <Text style={styles.subtitle}>
          {selection.project_name} · Selections, Revision {selection.revision_no}
        </Text>

        <View style={styles.metaBlock}>
          <Meta label="Revision" value={`R${selection.revision_no}`} />
          <Meta
            label="Status"
            value={
              isDraft
                ? "Draft — not issued"
                : selection.status === "issued"
                  ? "Issued"
                  : "Superseded"
            }
          />
          <Meta label="Issued" value={formatDate(selection.issued_at)} />
          <Meta label="Reference" value={reference} />
          <Meta label="Spaces" value={String(spaces.length)} />
          <Meta label="Lines" value={String(totalLines)} />
        </View>

        {selection.notes && (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Note</Text>
            <Text style={styles.noteText}>{selection.notes}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Contents</Text>
        {spaces.map((group, index) => (
          <View key={group.space.id} style={styles.contentsRow}>
            <Text>
              {index + 1}. {group.space.label}
              <Text style={{ color: pdf.color.muted }}> · {group.space.space_type_name}</Text>
            </Text>
            <Text style={{ color: pdf.color.muted }}>
              {group.lines.length} {group.lines.length === 1 ? "item" : "items"}
            </Text>
          </View>
        ))}

        {/* Only an issued revision is signable. */}
        {!isDraft && (
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

      {spaces.map((group) => (
        <DocumentPage key={group.space.id} meta={meta}>
          <View style={styles.spaceHeading}>
            <View>
              <Text style={styles.spaceName}>{group.space.label}</Text>
              <Text style={styles.spaceType}>{group.space.space_type_name}</Text>
            </View>
            <Text style={styles.spaceCount}>
              {group.lines.length} {group.lines.length === 1 ? "item" : "items"}
            </Text>
          </View>
          {group.space.description && (
            <Text style={{ fontSize: pdf.size.small, color: pdf.color.muted, marginBottom: 10 }}>
              {group.space.description}
            </Text>
          )}
          <SpaceViewGrid views={viewsBySpace.get(group.space.id) ?? []} />
          <DocumentTable columns={columns} rows={group.lines} />
        </DocumentPage>
      ))}
    </Document>
  );
}

/** One view runs full width; two or more go side by side, so stacked images don't push the specification to another sheet. */
function SpaceViewGrid({ views }: { views: ViewImage[] }) {
  if (views.length === 0) return null;
  const twoUp = views.length >= designView.twoUpFrom;

  return (
    <View style={styles.viewGrid}>
      {views.map((view, index) => (
        <View
          key={index}
          // wrap={false} keeps an image with its caption.
          wrap={false}
          style={{
            width: twoUp ? "50%" : "100%",
            paddingRight: twoUp && index % 2 === 0 ? 6 : 0,
            paddingLeft: twoUp && index % 2 === 1 ? 6 : 0,
            marginBottom: 8,
          }}
        >
          {/* react-pdf's Image is a PDF primitive, not an <img>: no alt, so the a11y rule doesn't apply. The {data, format} form avoids magic-byte sniffing. */}
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
