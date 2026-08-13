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

// THE report page for an unsaved spec: ?spec= in, a composed page out.
// The URL is the report — shareable, bookmarkable, and untrusted;
// everything below starts from parseReportSpec. A saved report renders
// the same ReportView from a stored spec instead of the URL.
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

  // Keyed on the raw param so navigating to a new spec remounts the
  // builder in sync with the report under it.
  return (
    <div className="space-y-6" key={params.spec ?? "blank"}>
      <PageTitle
        title={`${dataset.label} report`}
        description="Unsaved — the page link is the report. Share it, bookmark it, or save it by name."
        backHref="/reporter"
        backLabel="Reporter"
        actions={<SaveReportDialog spec={spec} trigger="Save report" />}
      />

      <SpecLoss lines={loss} />

      <ReportView spec={spec} basePath="/reporter/run" />
    </div>
  );
}
