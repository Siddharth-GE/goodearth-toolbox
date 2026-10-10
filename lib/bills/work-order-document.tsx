import { Document, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  DocumentHeading,
  DocumentPage,
  DocumentTable,
  MetaBlock,
  SectionLabel,
  Signatures,
  type Column,
  type DocumentMeta,
} from "@/lib/pdf/document";
import { pdf } from "@/lib/pdf/theme";
import { formatAmount, formatDate, formatQuantity } from "@/lib/format";
import type { WorkOrderDetail, WorkOrderLineRow } from "./work-order-queries";
import { workOrderLineAmount } from "./work-orders";

/**
 * The work order on paper (plan.md B6): the company's letterhead, the
 * number, the contractor and the villa, its works with quantities and
 * rates, the value, the terms, and signatures once it is approved. A
 * pending order prints with the DRAFT watermark — it is not yet an
 * order anyone may work against. Amounts in digits only (Helvetica has
 * no ₹ glyph), the currency said once.
 */

const styles = StyleSheet.create({
  currencyNote: { fontSize: pdf.size.tiny, color: pdf.color.muted, marginBottom: 6 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "flex-end",
    width: "45%",
    borderTopWidth: 1,
    borderTopColor: pdf.color.ruleStrong,
    paddingTop: 6,
    marginTop: 8,
  },
  totalLabel: { fontFamily: pdf.fontBold, fontSize: pdf.size.title },
  totalValue: { fontFamily: pdf.fontBold, fontSize: pdf.size.title },
  termsText: { fontSize: pdf.size.small, color: pdf.color.ink, lineHeight: 1.5 },
});

const amountOf = (line: WorkOrderLineRow) =>
  workOrderLineAmount({
    workItemId: line.work_item_id,
    description: line.description,
    isLumpSum: line.is_lump_sum,
    quantity: line.quantity,
    uom: line.uom,
    rate: line.rate,
  });

const columns: Column<WorkOrderLineRow>[] = [
  { header: "#", width: 0.4, render: (_row, index) => String(index + 1) },
  {
    header: "Work",
    width: 4,
    render: (row) => row.description,
    detail: (row) => row.work_label,
  },
  {
    header: "Quantity",
    width: 1.2,
    align: "right",
    render: (row) =>
      row.is_lump_sum ? "Lump sum" : `${formatQuantity(row.quantity)} ${row.uom ?? ""}`,
  },
  {
    header: "Rate",
    width: 1.1,
    align: "right",
    render: (row) => (row.is_lump_sum ? "—" : formatAmount(row.rate)),
  },
  { header: "Amount", width: 1.3, align: "right", render: (row) => formatAmount(amountOf(row)) },
];

export function WorkOrderDocument({ order }: { order: WorkOrderDetail }) {
  const isDraft = order.status !== "approved";
  const reference = order.reference ?? "Work order";

  const meta: DocumentMeta = {
    documentType: "WORK ORDER",
    reference,
    footerLeft: `${order.project_name} · ${reference}`,
    isDraft,
    company: order.company,
  };

  return (
    <Document
      title={`Goodearth Work Order — ${reference}`}
      author="Goodearth"
      creator="Goodearth Toolbox"
    >
      <DocumentPage meta={meta}>
        <DocumentHeading
          title={reference}
          subtitle={[order.project_name, order.place, "Work order"].join(" · ")}
        />

        <MetaBlock
          items={[
            { label: "Contractor", value: order.vendor_name },
            { label: "Covers", value: order.description },
            { label: "Date", value: formatDate(order.approved_at ?? order.created_at) },
            { label: "Status", value: isDraft ? "DRAFT — awaiting approval" : "Approved" },
            { label: "Project", value: order.project_name },
            { label: "Villa", value: order.place },
            { label: "Made by", value: order.created_by_name ?? "—" },
            { label: "Approved by", value: order.approved_by_name ?? "—" },
          ]}
        />

        <SectionLabel>Works</SectionLabel>
        <Text style={styles.currencyNote}>All amounts in Indian Rupees.</Text>
        {order.lines.length > 0 ? (
          <DocumentTable columns={columns} rows={order.lines} />
        ) : (
          <Text style={styles.termsText}>{order.description}</Text>
        )}

        <View style={styles.totalRow} wrap={false}>
          <Text style={styles.totalLabel}>Value</Text>
          <Text style={styles.totalValue}>{formatAmount(order.contract_value)}</Text>
        </View>

        {/* Not kept whole: a full set of terms can run past one page. */}
        {order.terms && (
          <View>
            <SectionLabel>Terms and conditions</SectionLabel>
            <Text style={styles.termsText}>{order.terms}</Text>
          </View>
        )}

        {!isDraft && (
          <Signatures
            labels={[
              `For ${order.company?.legal_name || order.company?.name || "Goodearth"}`,
              `Contractor — ${order.vendor_name}`,
            ]}
          />
        )}
      </DocumentPage>
    </Document>
  );
}
