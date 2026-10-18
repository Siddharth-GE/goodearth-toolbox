import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { pdfResponse, safeFileNamePart } from "@/lib/pdf/response";
import { BillDocument } from "@/lib/bills/bill-document";
import { getBillLines } from "@/lib/bills/line-queries";
import { getBillSettlement } from "@/lib/bills/payment-queries";
import { getBill } from "@/lib/bills/queries";
import { getProjectCompany } from "@/lib/masters/companies";
import { createElement, type ReactElement } from "react";

// getBill enforces the /bills grant. On demand, so it never drifts; a bill not yet approved carries its DRAFT watermark.
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

  const draftTag = bill.status === "recorded" ? "-DRAFT" : "";
  const filename = `Goodearth-Bill-${safeFileNamePart(bill.reference)}${draftTag}.pdf`;

  return pdfResponse(buffer, filename, { disposition: "inline" });
}
