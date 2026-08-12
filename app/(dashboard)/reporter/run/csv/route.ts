import { csvResponse } from "@/lib/csv";
import { reportCsvFilename, reportCsvRows } from "@/lib/reporter/csv-rows";
import { DATASETS } from "@/lib/reporter/datasets";
import { runSpecForCsv } from "@/lib/reporter/queries";
import { decodeSpecParam, defaultSpec, measureId, parseReportSpec } from "@/lib/reporter/spec";

import { measureLabel } from "../../_components/labels";

/**
 * A run report as a spreadsheet. Same `?spec=` as the page, so the
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

  const dataset = DATASETS[spec.dataset];
  const rows = reportCsvRows(
    dataset,
    spec,
    outcome.result,
    // The same headings the table and the chart use — built from the
    // one measureLabel(), so the three can never disagree.
    Object.fromEntries(
      spec.measures.map((measure) => [
        measureId(measure),
        measureLabel(dataset.fields[measure.field].label, measure.agg),
      ]),
    ),
  );

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(rows, reportCsvFilename(dataset, today));
}
