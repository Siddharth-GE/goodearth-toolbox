import { Section } from "@/components/ui/section";
import type { EngagementDetail } from "@/lib/client-relations/queries";
import Link from "next/link";

import { CollectionsPanel } from "./collections-panel";
import { EngagementFields } from "./engagement-fields";
import { EngagementTabs } from "./engagement-tabs";
import { RelayPanel } from "./relay-panel";
import { UnitStatusBadge } from "./crm-badges";

type Person = { id: string; name: string };

/**
 * One plot in full, tabbed. Used by both entry points — a client's page
 * (which renders one of these per plot they hold) and the standalone plot
 * page (which is how the five unassigned Saarang plots are reached). Same
 * component, so the two can never drift apart.
 */
export function EngagementCard({
  engagement,
  owners,
  heading,
}: {
  engagement: EngagementDetail;
  owners: Person[];
  /** Shown on a client's page, where several plots stack up. */
  heading?: boolean;
}) {
  const tabs = (
    <EngagementTabs
      engagement={engagement}
      sale={<EngagementFields engagement={engagement} owners={owners} />}
      design={<RelayPanel engagement={engagement} />}
      collections={<CollectionsPanel engagement={engagement} />}
    />
  );

  if (!heading) return tabs;

  return (
    <Section
      title={engagement.unitName}
      note={`${engagement.projectName}${engagement.plotName ? ` · ${engagement.plotName}` : ""}`}
      aside={
        <div className="flex items-center gap-2">
          <UnitStatusBadge status={engagement.unitStatus} />
          <Link
            href={`/client-relations/plots/${engagement.id}`}
            className="text-accent text-sm font-medium hover:underline"
          >
            Open
          </Link>
        </div>
      }
    >
      {tabs}
    </Section>
  );
}
