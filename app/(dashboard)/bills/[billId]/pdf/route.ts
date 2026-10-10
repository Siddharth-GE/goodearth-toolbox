import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { BillDocument } from "@/lib/bills/bill-document";
import { getBillLines } from "@/lib/bills/line-queries";
import { getBillSettlement } from "@/lib/bills/payment-queries";
import { getBill } from "@/lib/bills/queries";
import { getProjectCompany } from "@/lib/masters/companies";
import { createElement, type ReactElement } from "react";

/**
 * The bill, as a PDF to print. getBill enforces the /bills grant. Opened
 * in the browser rather than downloaded, because the ask is to print it;
 * generated on demand so it never drifts from the bill, and a bill not
 * yet approved carries its DRAFT watermark.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;

  const bill = await getBill(billId);
  if (!bill) return new Response("Not found", { status: 404 });

  const [lines, settlement, company] = await Promise.all([
    getBillLines(billId),
    getBillSettlement(billId, bill.total_amount),
    getProjectCompany(bill.project_id),
  ]);

  const buffer = await renderToBuffer(
    createElement(BillDocument, {
      data: { bill, lines, settlement, company },
    }) as ReactElement<DocumentProps>,
  );

  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  const draftTag = bill.status === "recorded" ? "-DRAFT" : "";
  const filename = `Goodearth-Bill-${safe(bill.reference)}${draftTag}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
