import { LinkButton } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { formatDate } from "@/lib/format";
import { getReportDate } from "@/lib/saarang-collections/queries";
import { CollectionsNav } from "./_components/collections-nav";

export default async function SaarangCollectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  await requireApp(user, "/saarang-collections");
  const { reportDate, hasReports } = await getReportDate();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Saarang Collections"
        description="The monthly Saarang collection meeting, from the Zoho exports."
        actions={
          <>
            {reportDate ? (
              <span className="text-muted text-sm tabular-nums">
                As of <b className="text-foreground font-medium">{formatDate(reportDate)}</b>
              </span>
            ) : null}
            {hasReports ? (
              <LinkButton href="/saarang-collections/download" plain>
                Download Excel
              </LinkButton>
            ) : null}
          </>
        }
      />
      <CollectionsNav />
      {children}
    </div>
  );
}
