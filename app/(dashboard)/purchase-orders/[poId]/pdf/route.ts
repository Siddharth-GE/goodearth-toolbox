import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { PoDocument } from "@/lib/purchase-orders/po-document";
import { getPoPdfData } from "@/lib/purchase-orders/queries";
import { createElement, type ReactElement } from "react";

/**
 * Document D — the purchase order, as a PDF download.
 *
 * getPoPdfData enforces the /purchase-orders grant, so someone without
 * it gets redirected rather than a file. Generated on demand rather
 * than stored, so it can never drift from the figures it represents —
 * and a draft always prints with its watermark.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params;

  const data = await getPoPdfData(poId);
  if (!data) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    createElement(PoDocument, { data }) as ReactElement<DocumentProps>,
  );

  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  const draftTag = data.po.status === "draft" ? "-DRAFT" : "";
  const filename = `Goodearth-PO-${safe(data.po.reference)}${draftTag}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
