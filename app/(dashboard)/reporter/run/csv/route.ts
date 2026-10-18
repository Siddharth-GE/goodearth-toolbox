import { reportCsvResponse } from "@/lib/reporter/csv-rows";
import { DATASETS } from "@/lib/reporter/datasets";
import { runSpecForCsv } from "@/lib/reporter/queries";
import { decodeSpecParam, defaultSpec, parseReportSpec } from "@/lib/reporter/spec";

// The spec is untrusted: it goes through parseReportSpec, and runSpecForCsv calls
// requireTool("/reporter") before reading anything. Carries every matched line, not the first N.
export async function GET(request: Request) {
  const raw = decodeSpecParam(new URL(request.url).searchParams.get("spec") ?? undefined);
  const spec = raw === null ? defaultSpec("") : parseReportSpec(raw);

  const outcome = await runSpecForCsv(spec);
  if (!outcome.ok) {
    return new Response(outcome.message, {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return reportCsvResponse(DATASETS[spec.dataset], spec, outcome.result);
}
