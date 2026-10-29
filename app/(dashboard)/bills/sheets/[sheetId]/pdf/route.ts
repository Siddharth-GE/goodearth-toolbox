import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { pdfResponse, safeFileNamePart } from "@/lib/pdf/response";
import { loadSheetPdfData } from "@/lib/bills/pdf-data";
import { SheetDocument } from "@/lib/bills/sheet-document";
import { createElement, type ReactElement } from "react";

// getSheet enforces the /bills grant; a sheet not yet approved carries its DRAFT watermark.
export async function GET(_request: Request, { params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params;

  const data = await loadSheetPdfData(sheetId);
  if (!data) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    createElement(SheetDocument, { data }) as ReactElement<DocumentProps>,
  );

  const draftTag = data.sheet.status === "approved" ? "" : "-DRAFT";
  const filename = `Goodearth-Consolidated-${safeFileNamePart(data.sheet.reference)}${draftTag}.pdf`;

  return pdfResponse(buffer, filename, { disposition: "inline" });
}
