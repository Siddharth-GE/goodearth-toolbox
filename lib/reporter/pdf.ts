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

// Generated on demand, never stored; runSpec enforces the /reporter grant before any row is read.
// Mirrors the screen (detail cut to the row limit with a "first N of M" note); the CSV carries
// every line.
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

  // createElement because route.ts files don't compile JSX; the cast bridges renderToBuffer's
  // <Document> typing.
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
      "Cache-Control": "no-store",
    },
  });
}
