import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/lib/birdwing/invoice-document";
import { getInvoicePrint } from "@/lib/birdwing/queries";
import { idParam } from "@/lib/list-params";
import { createElement, type ReactElement } from "react";

/** Generated on demand, never stored. An issued invoice prints from its snapshot; before that, a DRAFT. `?invoice=<id>` prints an older one. */
export async function GET(request: Request, { params }: { params: Promise<{ stayId: string }> }) {
  const { stayId } = await params;
  const requested = new URL(request.url).searchParams.get("invoice") ?? undefined;
  const invoiceId = requested ? idParam(requested) : undefined;
  if (requested && !invoiceId) return new Response("Not found", { status: 404 });

  const invoice = await getInvoicePrint(stayId, invoiceId);
  if (!invoice) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    createElement(InvoiceDocument, { invoice }) as ReactElement<DocumentProps>,
  );

  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  const name = invoice.number
    ? `Birdwing-Invoice-${safe(invoice.number)}${invoice.mode === "cancelled" ? "-CANCELLED" : ""}`
    : `Birdwing-Invoice-${safe(invoice.stay.ref)}-DRAFT`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
