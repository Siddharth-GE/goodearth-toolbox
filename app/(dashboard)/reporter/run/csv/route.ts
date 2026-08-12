import { reportCsvResponse } from "@/lib/reporter/csv-rows";
import { DATASETS } from "@/lib/reporter/datasets";
import { runSpecForCsv } from "@/lib/reporter/queries";
import { decodeSpecParam, defaultSpec, parseReportSpec } from "@/lib/reporter/spec";

/**
 * An unsaved report as a spreadsheet. Same `?spec=` as the page, so the
 * download is exactly the report on screen — with every matched line
 * rather than the first N, because the row limit is a screen setting.
 *
 * The spec is untrusted (a hand-edited URL is just another input), so
 * it goes through parseReportSpec like every other route into Reporter,
 * and runSpecForCsv calls requireTool("/reporter") before reading
 * anything. No grant, no file.
 */
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
