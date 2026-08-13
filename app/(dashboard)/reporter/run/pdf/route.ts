import { DATASETS } from "@/lib/reporter/datasets";
import { reportPdfResponse } from "@/lib/reporter/pdf";
import { decodeSpecParam, defaultSpec, parseReportSpec } from "@/lib/reporter/spec";

/**
 * An unsaved report as a PDF. Same `?spec=` as the page; the spec is
 * untrusted and goes through parseReportSpec like every other route
 * into Reporter. reportPdfResponse runs it under requireTool.
 */
export async function GET(request: Request) {
  const raw = decodeSpecParam(new URL(request.url).searchParams.get("spec") ?? undefined);
  const spec = raw === null ? defaultSpec("") : parseReportSpec(raw);
  const dataset = DATASETS[spec.dataset];
  return reportPdfResponse(spec, `${dataset.label} report`, null);
}
