import { reportCsvResponse } from "@/lib/reporter/csv-rows";
import { DATASETS } from "@/lib/reporter/datasets";
import { getReport, runSpecForCsv } from "@/lib/reporter/queries";
import { decodeSpecParam, parseReportSpec } from "@/lib/reporter/spec";

// A `?spec=` overrides the stored spec (the page allows the same reshaping); both paths end at the
// same parser. getReport() returns null for "no such report" and "not yours" alike, so an ungranted
// request gets a 404, never a file.
export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const report = await getReport(reportId);
  if (!report) return new Response("Not found", { status: 404 });

  const raw = decodeSpecParam(new URL(request.url).searchParams.get("spec") ?? undefined);
  const spec = raw === null ? report.spec : parseReportSpec(raw);

  const outcome = await runSpecForCsv(spec);
  if (!outcome.ok) {
    return new Response(outcome.message, {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return reportCsvResponse(DATASETS[spec.dataset], spec, outcome.result);
}
