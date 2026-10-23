import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { pdfResponse, safeFileNamePart } from "@/lib/pdf/response";
import { WorkOrderDocument } from "@/lib/bills/work-order-document";
import { getWorkOrder } from "@/lib/bills/work-order-queries";
import { createElement, type ReactElement } from "react";

// getWorkOrder enforces the /bills grant. On demand, so it never drifts; a pending order carries its DRAFT watermark.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await getWorkOrder(id);
  if (!order) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    createElement(WorkOrderDocument, { order }) as ReactElement<DocumentProps>,
  );

  const draftTag =
    order.status === "approved" ? "" : order.status === "cancelled" ? "-CANCELLED" : "-DRAFT";
  const filename = `Goodearth-WorkOrder-${safeFileNamePart(order.reference ?? order.id)}${draftTag}.pdf`;

  return pdfResponse(buffer, filename, { disposition: "inline" });
}
