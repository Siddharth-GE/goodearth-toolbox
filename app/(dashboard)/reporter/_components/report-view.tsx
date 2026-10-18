import { Download, FileText } from "lucide-react";

import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { chartModelFor } from "@/lib/reporter/chart-model";
import { DATASETS } from "@/lib/reporter/datasets";
import {
  listFilterOptions,
  listProjectOptions,
  listUnitOptions,
  listVendorOptions,
  runSpec,
} from "@/lib/reporter/queries";
import { builderDataset, encodeSpec, type ReportSpec } from "@/lib/reporter/spec";

import { QuickFilters } from "./quick-filters";
import { ReportBuilder } from "./report-builder";
import { ReportChart } from "./report-chart";
import { ReportSummary } from "./report-summary";
import { ReportTable } from "./report-table";

// One component for unsaved and saved reports so they can't drift. A Server Component: queries run
// here, and the chart model is shaped by pure, tested code.
export async function ReportView({
  spec,
  basePath,
}: {
  spec: ReportSpec;
  /** Where "Run report" pushes, and what `/csv` hangs off. */
  basePath: string;
}) {
  const [outcome, projects, units, vendors, options] = await Promise.all([
    runSpec(spec),
    listProjectOptions(),
    listUnitOptions(),
    listVendorOptions(),
    listFilterOptions(spec.dataset),
  ]);
  const dataset = DATASETS[spec.dataset];

  const chartModel = outcome.ok ? chartModelFor(dataset, spec, outcome.result) : null;

  return (
    <>
      <QuickFilters
        spec={spec}
        basePath={basePath}
        projects={projects}
        units={units}
        vendors={vendors}
      />
      <ReportBuilder
        dataset={builderDataset(spec.dataset)}
        spec={spec}
        basePath={basePath}
        projects={projects}
        units={units}
        vendors={vendors}
        options={options}
      />

      {outcome.ok ? (
        <>
          <ReportSummary spec={spec} result={outcome.result} />
          {chartModel && <ReportChart model={chartModel} />}
          {outcome.result.matched > 0 && (
            <div className="flex justify-end gap-2">
              {/* Re-encoded from what ran so the file matches the page; `plain` stops next/link
                  prefetching (and building) the download. */}
              <LinkButton
                href={`${basePath}/pdf?spec=${encodeSpec(spec)}`}
                variant="secondary"
                size="sm"
                plain
              >
                <FileText className="size-4" />
                Download PDF
              </LinkButton>
              <LinkButton
                href={`${basePath}/csv?spec=${encodeSpec(spec)}`}
                variant="secondary"
                size="sm"
                plain
              >
                <Download className="size-4" />
                Download CSV
              </LinkButton>
            </div>
          )}
          <ReportTable spec={spec} result={outcome.result} />
        </>
      ) : (
        <EmptyState title="Too many lines to load" description={outcome.message} />
      )}
    </>
  );
}
