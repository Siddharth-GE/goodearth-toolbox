import { PageTitle } from "@/components/ui/page-title";
import { DATASETS } from "@/lib/reporter/datasets";
import {
  decodeSpecParam,
  defaultSpec,
  describeSpecLoss,
  parseReportSpec,
} from "@/lib/reporter/spec";

import { ReportView } from "../_components/report-view";
import { SaveReportDialog } from "../_components/save-report-dialog";
import { SpecLoss } from "../_components/spec-loss";

// The URL is the report: shareable and untrusted, so everything starts from parseReportSpec.
export default async function RunReportPage({
  searchParams,
}: {
  searchParams: Promise<{ spec?: string }>;
}) {
  const params = await searchParams;
  const decoded = decodeSpecParam(params.spec);
  const spec = decoded === null ? defaultSpec("") : parseReportSpec(decoded);
  const loss = decoded === null ? [] : describeSpecLoss(decoded);
  const dataset = DATASETS[spec.dataset];

  return (
    <div className="space-y-6" key={params.spec ?? "blank"}>
      <PageTitle
        title={`${dataset.label} report`}
        description="Unsaved — the page link is the report. Share it, bookmark it, or save it by name."
        backHref="/reporter/saved"
        backLabel="Reports"
        actions={<SaveReportDialog spec={spec} trigger="Save report" />}
      />

      <SpecLoss lines={loss} />

      <ReportView spec={spec} basePath="/reporter/run" />
    </div>
  );
}
