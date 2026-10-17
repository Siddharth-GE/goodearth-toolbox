import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getTransmittalDetail } from "@/lib/design-management/queries";
import { TransmittalDocument } from "@/lib/design-management/transmittal-document";
import { createElement, type ReactElement } from "react";

/**
 * Generated on demand so the sheet never drifts from the record. getTransmittalDetail enforces the grant, and its `null` covers both "no such transmittal" and "hidden by the SELECT qual": the same 404, which gives nothing away.
 * The drawings are NOT embedded: react-pdf embeds only images, and this is the covering note.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transmittalId: string }> },
) {
  const { transmittalId } = await params;
  const transmittal = await getTransmittalDetail(transmittalId);
  if (!transmittal) return new Response("Not found", { status: 404 });

  // createElement, not JSX: route.ts doesn't compile JSX. The cast is because renderToBuffer is typed for a <Document> element.
  const buffer = await renderToBuffer(
    createElement(TransmittalDocument, { transmittal }) as ReactElement<DocumentProps>,
  );

  // The number counts per villa (0092), so the villa is in the name (TB-0003 alone names a transmittal on every villa). A draft has no number, so it is marked a draft.
  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  const villa = transmittal.villaName.replace(/[^A-Za-z0-9]+/g, "") || "Villa";
  const filename = transmittal.number
    ? `Goodearth-Transmittal-${villa}-${safe(transmittal.number)}.pdf`
    : `Goodearth-Transmittal-${villa}-Draft.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A draft's contents change while assembled: never cache.
      "Cache-Control": "no-store",
    },
  });
}
