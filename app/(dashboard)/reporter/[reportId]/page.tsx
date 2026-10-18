import { notFound } from "next/navigation";

import { Attribution } from "@/components/ui/attribution";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getReport, getReportSpecLoss } from "@/lib/reporter/queries";
import { decodeSpecParam, describeSpecLoss, parseReportSpec } from "@/lib/reporter/spec";

import { ReportActions } from "../_components/report-actions";
import { ReportView } from "../_components/report-view";
import { SaveReportDialog } from "../_components/save-report-dialog";
import { SpecLoss } from "../_components/spec-loss";

// `[reportId]` is a `reports.id` uuid OR a `starter-*` id. A `?spec=` is a report reshaped in
// place: looking is free, saving is deliberate. Starters are read-only ("Save a copy").
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ spec?: string }>;
}) {
  const { reportId } = await params;
  const { spec: specParam } = await searchParams;

  const report = await getReport(reportId);
  // Null covers "no such report" and "not visible to you": RLS makes them indistinguishable.
  if (!report) notFound();

  const decoded = decodeSpecParam(specParam);
  const spec = decoded === null ? report.spec : parseReportSpec(decoded);
  // Both sides come from parseReportSpec's fixed key order, so this compares shape, not spelling.
  const changed = JSON.stringify(spec) !== JSON.stringify(report.spec);
  const loss = decoded === null ? await getReportSpecLoss(reportId) : describeSpecLoss(decoded);

  const description = report.starter
    ? `${report.description} A starting point — change anything and save your own copy.`
    : (report.description ?? "A saved report.");

  return (
    <div className="space-y-6" key={specParam ?? "saved"}>
      <PageTitle
        title={report.name}
        description={description}
        backHref="/reporter/saved"
        backLabel="Reports"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!report.starter && (
              <ReportActions
                reportId={report.id}
                name={report.name}
                description={report.description}
                spec={spec}
                changed={changed}
                canDelete={report.canDelete}
              />
            )}
            <SaveReportDialog
              spec={spec}
              trigger="Save a copy"
              title="Save a copy"
              variant={report.starter ? "primary" : "secondary"}
              defaultName={report.starter ? report.name : `${report.name} (copy)`}
              defaultDescription={report.description ?? ""}
            />
          </div>
        }
      />

      {report.updated_at && (
        <p className="text-muted -mt-3 flex items-center gap-2 text-xs">
          <span>Last saved {formatDate(report.updated_at)}</span>
          <Attribution name={report.updated_by_name} label="Last saved by" />
        </p>
      )}

      {changed && !report.starter && (
        <p className="text-muted text-sm">
          Showing changes that are not saved yet. Press <strong>Save changes</strong> to keep them,
          or reload this page without the link&rsquo;s extra part to go back to the saved report.
        </p>
      )}

      <SpecLoss lines={loss} />

      <ReportView spec={spec} basePath={`/reporter/${report.id}`} />
    </div>
  );
}
