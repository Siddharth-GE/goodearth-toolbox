import { PageTitle } from "@/components/ui/page-title";
import { EmptyState } from "@/components/ui/empty-state";
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
  parseReportSpec,
} from "@/lib/reporter/spec";

import { ReportBuilder } from "../_components/report-builder";
import { ReportTable } from "../_components/report-table";

// THE report page for an unsaved spec: ?spec= in, table out. The URL is
// the report — shareable, bookmarkable, and untrusted; everything below
// starts from parseReportSpec. Saved reports (Stage 5) render the same
// two components from a stored spec instead of the URL.
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
        <ReportTable spec={spec} result={outcome.result} />
      ) : (
        <EmptyState title="Too many lines to load" description={outcome.message} />
      )}
    </div>
  );
}
