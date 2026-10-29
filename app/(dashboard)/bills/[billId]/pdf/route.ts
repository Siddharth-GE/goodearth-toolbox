import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { pdfResponse, safeFileNamePart } from "@/lib/pdf/response";
import { BillDocument } from "@/lib/bills/bill-document";
import { loadBillPdfData } from "@/lib/bills/pdf-data";
import { createElement, type ReactElement } from "react";

// getBill enforces the /bills grant. On demand, so it never drifts; a bill not yet approved carries its DRAFT watermark.
export async function GET(_request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;

  const data = await loadBillPdfData(billId);
  if (!data) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    createElement(BillDocument, { data }) as ReactElement<DocumentProps>,
  );

  const draftTag = data.bill.status === "recorded" ? "-DRAFT" : "";
  const filename = `Goodearth-Bill-${safeFileNamePart(data.bill.reference)}${draftTag}.pdf`;

  return pdfResponse(buffer, filename, { disposition: "inline" });
}
