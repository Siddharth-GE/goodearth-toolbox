import { PageTitle } from "@/components/ui/page-title";
import { getEngagement, getFilterOptions } from "@/lib/client-relations/queries";
import { notFound } from "next/navigation";
import Link from "next/link";

import { UnitStatusBadge } from "../../_components/crm-badges";
import { EngagementCard } from "../../_components/engagement-card";

/**
 * One plot on its own.
 *
 * The client page is the main way in, but a plot with no buyer has no
 * client page to live on — five of Saarang's forty-three are in exactly
 * that position — and the plot register links here regardless, so a row
 * always opens something.
 */
export default async function PlotDetailPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;

  const [engagement, options] = await Promise.all([
    getEngagement(engagementId),
    getFilterOptions(),
  ]);
  if (!engagement) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title={engagement.unitName}
        backHref="/client-relations/plots"
        backLabel="Plots"
        description={
          engagement.clientId ? (
            <>
              {engagement.projectName} ·{" "}
              <Link href={`/client-relations/${engagement.clientId}`} className="hover:underline">
                {engagement.clientName}
              </Link>
            </>
          ) : (
            `${engagement.projectName} · no buyer yet`
          )
        }
        actions={<UnitStatusBadge status={engagement.unitStatus} />}
      />

      <EngagementCard engagement={engagement} owners={options.owners} />
    </div>
  );
}
