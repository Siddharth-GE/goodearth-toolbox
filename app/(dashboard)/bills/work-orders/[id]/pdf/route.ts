import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
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

  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  const draftTag = order.status === "approved" ? "" : "-DRAFT";
  const filename = `Goodearth-WorkOrder-${safe(order.reference ?? order.id)}${draftTag}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
