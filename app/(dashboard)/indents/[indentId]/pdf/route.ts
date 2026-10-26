import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { pdfResponse, safeFileNamePart } from "@/lib/pdf/response";
import { IndentDocument } from "@/lib/indents/indent-document";
import { getIndent } from "@/lib/indents/detail-queries";
import { getProjectCompany } from "@/lib/masters/companies";
import { listWorkGroups, listWorkItems } from "@/lib/masters/works";
import { createElement, type ReactElement } from "react";

// getIndent enforces the /indents grant. Inline for printing; on demand, so it never drifts.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ indentId: string }> },
) {
  const { indentId } = await params;

  const indent = await getIndent(indentId);
  if (!indent) return new Response("Not found", { status: 404 });

  // A stage indent (0158) prints its stage where an older one prints its work.
  const [work, company] = await Promise.all([
    indent.work_group_id
      ? listWorkGroups().then((rows) => rows.find((row) => row.id === indent.work_group_id))
      : indent.work_item_id
        ? listWorkItems().then((rows) => rows.find((row) => row.id === indent.work_item_id))
        : undefined,
    getProjectCompany(indent.project_id),
  ]);

  const buffer = await renderToBuffer(
    createElement(IndentDocument, {
      data: { indent, work_label: work ? `${work.name} — ${work.code}` : null, company },
    }) as ReactElement<DocumentProps>,
  );

  const draftTag =
    indent.status === "draft" ? "-DRAFT" : indent.status === "cancelled" ? "-CANCELLED" : "";
  const filename = `Goodearth-Indent-${safeFileNamePart(indent.reference)}${draftTag}.pdf`;

  return pdfResponse(buffer, filename, { disposition: "inline" });
}
