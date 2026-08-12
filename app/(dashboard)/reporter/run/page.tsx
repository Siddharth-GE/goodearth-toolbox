import { PageTitle } from "@/components/ui/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { buildChartModel, type ChartModel } from "@/lib/charts/series";
import { DATASETS } from "@/lib/reporter/datasets";
import {
  listFilterOptions,
  listProjectOptions,
  listUnitOptions,
  runSpec,
} from "@/lib/reporter/queries";
import {
  builderDataset,
  decodeSpecParam,
  defaultSpec,
  describeSpecLoss,
  measureId,
  parseReportSpec,
} from "@/lib/reporter/spec";

import { measureLabel } from "../_components/labels";
import { ReportBuilder } from "../_components/report-builder";
import { ReportChart } from "../_components/report-chart";
import { ReportSummary } from "../_components/report-summary";
import { ReportTable } from "../_components/report-table";

// THE report page for an unsaved spec: ?spec= in, a composed page out —
// headline figures, chart, then the table with subtotals. The URL is
// the report — shareable, bookmarkable, and untrusted; everything below
// starts from parseReportSpec. Saved reports (Stage 5) render the same
// components from a stored spec instead of the URL.
export default async function RunReportPage({
  searchParams,
}: {
  searchParams: Promise<{ spec?: string }>;
}) {
  const params = await searchParams;
  const decoded = decodeSpecParam(params.spec);
  const spec = decoded === null ? defaultSpec("") : parseReportSpec(decoded);
  const loss = decoded === null ? [] : describeSpecLoss(decoded);

  const [outcome, projects, units, options] = await Promise.all([
    runSpec(spec),
    listProjectOptions(),
    listUnitOptions(),
    listFilterOptions(spec.dataset),
  ]);
  const dataset = DATASETS[spec.dataset];

  // The chart model is shaped server-side by the pure, tested code;
  // the client component only picks a wrapper for it.
  let chartModel: ChartModel | null = null;
  if (outcome.ok && spec.chart) {
    chartModel = buildChartModel({
      spec,
      result: outcome.result,
      measureLabels: Object.fromEntries(
        spec.measures.map((measure) => [
          measureId(measure),
          measureLabel(dataset.fields[measure.field].label, measure.agg),
        ]),
      ),
      fieldLabels: Object.fromEntries(
        Object.entries(dataset.fields).map(([key, field]) => [key, field.label]),
      ),
      moneyMeasures: spec.measures
        .filter((measure) => dataset.fields[measure.field].type === "money")
        .map((measure) => measureId(measure)),
    });
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title={`${dataset.label} report`}
        description="Unsaved — the page link is the report. Share or bookmark it."
        backHref="/reporter"
        backLabel="Reporter"
      />

      {loss.length > 0 && (
        <div className="border-border bg-surface rounded-2xl border p-4">
          <p className="text-foreground text-sm font-medium">
            Parts of this report no longer apply and were left out
          </p>
          <ul className="text-muted mt-1 list-disc pl-5 text-sm">
            {loss.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <ReportBuilder
        key={params.spec ?? "blank"}
        dataset={builderDataset(spec.dataset)}
        spec={spec}
        projects={projects}
        units={units}
        options={options}
      />

      {outcome.ok ? (
        <>
          <ReportSummary spec={spec} result={outcome.result} />
          {chartModel && <ReportChart model={chartModel} />}
          <ReportTable spec={spec} result={outcome.result} />
        </>
      ) : (
        <EmptyState title="Too many lines to load" description={outcome.message} />
      )}
    </div>
  );
}
