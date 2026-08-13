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

import { ReportBuilder } from "./report-builder";
import { ReportChart } from "./report-chart";
import { ReportSummary } from "./report-summary";
import { ReportTable } from "./report-table";

/**
 * A report, composed: the builder, then headline figures, the chart and
 * the table. One component so an unsaved report (`/reporter/run`) and a
 * saved one (`/reporter/[reportId]`) cannot drift into two different
 * pages — the only difference between them is where the builder pushes
 * its changes and what the toolbar above offers.
 *
 * A Server Component: every query runs here, and the chart model is
 * shaped by the pure, tested code before any of it reaches the browser.
 */
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

  // The same helper the PDF route uses, so paper and screen can never
  // shape the same chart differently.
  const chartModel = outcome.ok ? chartModelFor(dataset, spec, outcome.result) : null;

  return (
    <>
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
              {/* The spec is re-encoded from what actually ran, so the
                  file matches the page even if the URL was hand-edited.
                  `plain` because next/link would prefetch the download
                  on hover and build the whole file for a passing
                  cursor. */}
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
