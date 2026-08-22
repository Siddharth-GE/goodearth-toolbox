import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getTransmittalDetail } from "@/lib/design-management/queries";
import { TransmittalDocument } from "@/lib/design-management/transmittal-document";
import { createElement, type ReactElement } from "react";

/**
 * Streams the transmittal's letterhead cover sheet as a PDF download.
 *
 * Generated on demand from the database rather than stored, so the sheet
 * can never drift from the record it represents. `getTransmittalDetail`
 * already enforces the /design-management grant, and its `null` covers
 * both "no such transmittal" and "hidden from this reader by the SELECT
 * qual" — the same 404 either way, which gives nothing away.
 *
 * The drawing files are NOT embedded: they are PDFs, react-pdf embeds
 * only images, and this is the covering note that goes out beside them.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transmittalId: string }> },
) {
  const { transmittalId } = await params;
  const transmittal = await getTransmittalDetail(transmittalId);
  if (!transmittal) return new Response("Not found", { status: 404 });

  // createElement rather than JSX: a Route Handler must be route.ts,
  // which doesn't compile JSX. The cast is because renderToBuffer is
  // typed for a <Document> element specifically and can't see through
  // the wrapper component to know that's exactly what it returns.
  const buffer = await renderToBuffer(
    createElement(TransmittalDocument, { transmittal }) as ReactElement<DocumentProps>,
  );

  // Filename built from real identifiers so a folder of these stays
  // sortable and self-explanatory months later. A draft has no number
  // to be filed under, so it is named by its villa and marked a draft.
  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  const filename = transmittal.number
    ? `Goodearth-Transmittal-${safe(transmittal.number)}.pdf`
    : `Goodearth-Transmittal-Draft-${safe(transmittal.villaName)}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A draft's contents change while it is being assembled, so never
      // let a browser or CDN hold on to one.
      "Cache-Control": "no-store",
    },
  });
}
