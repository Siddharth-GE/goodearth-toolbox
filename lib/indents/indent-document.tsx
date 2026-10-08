import { Document } from "@react-pdf/renderer";
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
} from "@/lib/pdf/document";
import { formatDate, formatQuantity } from "@/lib/format";
import type { IndentDetail, IndentLineRow } from "./queries";
import { stillToBuy } from "./workflow";

/**
 * The indent on paper — what site asked for, what has been ordered
 * against it, and what is still to buy. No money: an indent never carries
 * a rate, so this document cannot print one.
 */

export type IndentPdfData = {
  indent: IndentDetail;
  /** "Footing — (Base + 4 Sides) Area — FD.15", or null. */
  work_label: string | null;
  /** The project's company, printed on the letterhead; null → placeholder. */
  company: LetterheadCompany | null;
};

const STATUS_LABEL: Record<IndentDetail["status"], string> = {
  draft: "DRAFT — not yet submitted",
  submitted: "Submitted, awaiting approval",
  approved: "Approved",
};

const columns: Column<IndentLineRow>[] = [
  { header: "#", width: 0.4, render: (_row, index) => String(index + 1) },
  { header: "Code", width: 1, render: (row) => row.item_code ?? "—" },
  { header: "Material", width: 2.8, render: (row) => row.item_name },
  { header: "Unit", width: 0.7, render: (row) => row.uom },
  {
    header: "Requested",
    width: 1.1,
    align: "right",
    render: (row) => formatQuantity(row.quantity),
  },
  {
    header: "Ordered",
    width: 1,
    align: "right",
    render: (row) => formatQuantity(row.ordered_quantity),
  },
  {
    header: "To buy",
    width: 0.9,
    align: "right",
    render: (row) => {
      const left = stillToBuy(row.quantity, row.ordered_quantity);
      return left > 0 ? formatQuantity(left) : "—";
    },
  },
  { header: "Note", width: 1.8, render: (row) => row.note ?? "" },
];

export function IndentDocument({ data }: { data: IndentPdfData }) {
  const { indent } = data;
  const isDraft = indent.status === "draft";
  const site = [indent.plot_name, indent.unit_name].filter(Boolean).join(" · ");

  const meta: DocumentMeta = {
    documentType: "INDENT",
    reference: indent.reference,
    footerLeft: `${indent.project_name} · ${indent.reference}`,
    isDraft,
    company: data.company,
  };

  return (
    <Document
      title={`Goodearth Indent — ${indent.reference}`}
      author="Goodearth"
      creator="Goodearth Toolbox"
    >
      <DocumentPage meta={meta}>
        <DocumentHeading
          title={indent.reference}
          subtitle={[indent.project_name, site, "Material indent"].filter(Boolean).join(" · ")}
        />

        <MetaBlock
          items={[
            { label: "Raised", value: formatDate(indent.created_at) },
            {
              label: "Required by",
              value: indent.required_by ? formatDate(indent.required_by) : "—",
            },
            { label: "Status", value: STATUS_LABEL[indent.status] },
            { label: "Lines", value: String(indent.line_count) },
            { label: "Work", value: data.work_label ?? "—" },
            { label: "Submitted by", value: indent.submitted_by_name ?? "—" },
            { label: "Approved by", value: indent.approved_by_name ?? "—" },
            {
              label: "Approved on",
              value: indent.approved_at ? formatDate(indent.approved_at) : "—",
            },
          ]}
        />

        <SectionLabel>Materials</SectionLabel>
        <DocumentTable columns={columns} rows={indent.lines} />

        <NotesBlock notes={[{ label: "Note", text: indent.note }]} />

        {!isDraft && <Signatures labels={["Requested by", "Approved by", "Received by stores"]} />}
      </DocumentPage>
    </Document>
  );
}
