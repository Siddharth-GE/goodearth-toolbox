import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/lib/birdwing/invoice-document";
import { getInvoicePrint } from "@/lib/birdwing/queries";
import { idParam } from "@/lib/list-params";
import { createElement, type ReactElement } from "react";

/**
 * The stay's invoice as a PDF, opened in the browser to print or share.
 * getInvoicePrint enforces the /birdwing grant. An issued invoice prints
 * from the snapshot taken when it was issued; before that, a DRAFT from
 * the charges as they stand. `?invoice=<id>` prints an older (cancelled
 * or imported) one. Generated on demand, never stored.
 */
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
