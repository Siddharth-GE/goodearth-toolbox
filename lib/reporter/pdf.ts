import "server-only";

import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { safeFilename } from "@/lib/csv";
import { formatDate } from "@/lib/format";

import { DATASETS } from "./datasets";
import { runSpec } from "./queries";
import { chartModelFor } from "./chart-model";
import { ReportDocument } from "./report-document";
import type { ReportSpec } from "./spec";

/**
 * A run report as a PDF download — what both PDF routes return, so a
 * saved report and an unsaved one produce the same paper. Generated on
 * demand from the database, never stored, so a file cannot drift from
 * the record it represents; runSpec enforces the /reporter grant before
 * a single row is read.
 *
 * The PDF mirrors the SCREEN — detail cut to the spec's row limit with
 * an honest "first N of M" note; the CSV is the export that carries
 * every line. A grouped report prints all its groups.
 */
export async function reportPdfResponse(
  spec: ReportSpec,
  name: string,
  description: string | null,
): Promise<Response> {
  const outcome = await runSpec(spec);
  if (!outcome.ok) {
    return new Response(outcome.message, {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const dataset = DATASETS[spec.dataset];
  const generatedOn = formatDate(new Date());

  // createElement rather than JSX: callers are route.ts files, which do
  // not compile JSX. The cast is the same documented bridge the
  // Selections PDF route uses — renderToBuffer is typed for <Document>
  // and cannot see through the wrapper component.
  const buffer = await renderToBuffer(
    createElement(ReportDocument, {
      name,
      description,
      dataset,
      spec,
      result: outcome.result,
      chartModel: chartModelFor(dataset, spec, outcome.result),
      generatedOn,
    }) as ReactElement<DocumentProps>,
  );

  const today = new Date().toISOString().slice(0, 10);
  const filename = `Goodearth-Report-${safeFilename(name)}-${today}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A report is live data; never let a browser or CDN hold one.
      "Cache-Control": "no-store",
    },
  });
}
