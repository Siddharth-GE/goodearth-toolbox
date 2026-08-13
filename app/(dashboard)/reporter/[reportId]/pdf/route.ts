import { getReport } from "@/lib/reporter/queries";
import { reportPdfResponse } from "@/lib/reporter/pdf";
import { decodeSpecParam, parseReportSpec } from "@/lib/reporter/spec";

/**
 * A saved report — or a starting point — as a PDF. A `?spec=` overrides
 * the stored spec, because the page allows the same reshaping; both
 * paths end at the same parser. getReport() enforces the grant and
 * returns null for "no such report" and "not yours to see" alike.
 */
export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const report = await getReport(reportId);
  if (!report) return new Response("Not found", { status: 404 });

  const raw = decodeSpecParam(new URL(request.url).searchParams.get("spec") ?? undefined);
  const spec = raw === null ? report.spec : parseReportSpec(raw);

  return reportPdfResponse(spec, report.name, report.description);
}
