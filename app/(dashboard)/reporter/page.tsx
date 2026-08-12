import { FileChartColumn } from "lucide-react";

import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { requireTool } from "@/lib/auth/access";

// The landing grows with the stages: saved reports and the seven
// starting points both list here once they exist (Stage 5). Until then
// the one honest thing on it is the way in.
export default async function ReporterPage() {
  await requireTool("/reporter");

  return (
    <div className="space-y-6">
      <PageTitle
        title="Reporter"
        description="Build a report over any data — pick columns, filter, group, and total."
        actions={<LinkButton href="/reporter/new">New report</LinkButton>}
      />
      <EmptyState
        icon={FileChartColumn}
        title="No saved reports yet"
        description="Start a report from a data set, shape it, and share the page link. Saving reports by name comes next."
        action={
          <LinkButton href="/reporter/new" variant="secondary">
            Start a report
          </LinkButton>
        }
      />
    </div>
  );
}
