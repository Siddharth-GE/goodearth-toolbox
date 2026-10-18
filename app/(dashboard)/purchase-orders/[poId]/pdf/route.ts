import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { pdfResponse, safeFileNamePart } from "@/lib/pdf/response";
import { PoDocument } from "@/lib/purchase-orders/po-document";
import { getPoPdfData } from "@/lib/purchase-orders/queries";
import { createElement, type ReactElement } from "react";

// getPoPdfData enforces the /purchase-orders grant. On demand, so it never drifts; a draft prints with its watermark.
export async function GET(_request: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params;

  const data = await getPoPdfData(poId);
  if (!data) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    createElement(PoDocument, { data }) as ReactElement<DocumentProps>,
  );

  const draftTag = data.po.status === "draft" ? "-DRAFT" : "";
  const filename = `Goodearth-PO-${safeFileNamePart(data.po.reference)}${draftTag}.pdf`;

  return pdfResponse(buffer, filename, { disposition: "attachment" });
}
