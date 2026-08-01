import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getBudgetHandoff } from "@/lib/selections/queries";
import { SelectionDocument, type ViewImage } from "@/lib/selections/selection-document";
import { downloadSpaceView, listSpaceViews } from "@/lib/selections/views";
import { createElement, type ReactElement } from "react";

/**
 * Streams the Selections sheet set as a PDF download.
 *
 * Generated on demand from the database rather than stored, so a file can
 * never drift from the record it represents. `getBudgetHandoff` already
 * enforces the /selections grant.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ selectionId: string }> },
) {
  const { selectionId } = await params;
  const handoff = await getBudgetHandoff(selectionId);
  if (!handoff) return new Response("Not found", { status: 404 });

  // The views bucket is private, so react-pdf can't fetch by URL — the
  // bytes are downloaded here and handed to the document directly.
  const viewRows = await listSpaceViews(handoff.spaces.map((group) => group.space.id));
  const viewsBySpace = new Map<string, ViewImage[]>();
  // All spaces' downloads at once — they were one sequential batch per
  // space, which is what made a many-space document slow to generate.
  await Promise.all(
    [...viewRows].map(async ([spaceId, views]) => {
      const images = await Promise.all(
        views.map(async (view) => {
          const data = await downloadSpaceView(view.storage_path);
          return data ? { data, caption: view.caption } : null;
        }),
      );
      // A view whose file has gone missing is skipped rather than failing
      // the whole document — a client still needs the specification.
      const present = images.filter((image): image is ViewImage => image !== null);
      if (present.length > 0) viewsBySpace.set(spaceId, present);
    }),
  );

  // createElement rather than JSX: a Route Handler must be route.ts, which
  // doesn't compile JSX. The cast is because renderToBuffer is typed for a
  // <Document> element specifically, and it can't see through the wrapper
  // component to know that's exactly what SelectionDocument returns.
  const buffer = await renderToBuffer(
    createElement(SelectionDocument, { handoff, viewsBySpace }) as ReactElement<DocumentProps>,
  );

  // Filename built from real identifiers so a folder of these stays
  // sortable and self-explanatory months later.
  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  const filename = `Goodearth-Selections-${safe(handoff.selection.project_name)}-${safe(
    handoff.selection.unit_name,
  )}-R${handoff.selection.revision_no}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A revision's contents can change while it is a draft, so never
      // let a browser or CDN hold on to one.
      "Cache-Control": "no-store",
    },
  });
}
