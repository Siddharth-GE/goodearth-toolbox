import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { listVillas } from "@/lib/design-management/queries";
import { formatDate } from "@/lib/format";
import { HardHat } from "lucide-react";
import Link from "next/link";

/**
 * Every villa as a card, labelled by project.
 *
 * Founder, 2026-08-22 evening: "person sees all villas (as cards) goes
 * into the villa". Cards rather than rows because what each one has to
 * carry — how much has gone out, and when — does not fit a row on a
 * phone, and this is the screen that gets opened at site.
 */
export default async function DesignVillasPage() {
  const villas = await listVillas();

  const header = (
    <PageTitle
      title="Villas"
      description="Open a villa to see its transmittals and start a new one."
      backHref="/design-management"
      backLabel="Design Management"
    />
  );

  if (villas.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState
          icon={HardHat}
          title="No villas yet"
          description="Villas come from Masters — once units exist there, they show up here."
        />
      </div>
    );
  }

  const projects = [...new Set(villas.map((villa) => villa.projectName))].sort();

  return (
    <div className="space-y-5">
      {header}
      {projects.map((projectName) => (
        <div key={projectName} className="space-y-2">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            {projectName}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {villas
              .filter((villa) => villa.projectName === projectName)
              .map((villa) => (
                <Link
                  key={villa.unitId}
                  href={`/design-management/villas/${villa.unitId}`}
                  className="focus-visible:ring-accent rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Card className="hover:border-accent h-full space-y-2 p-4 transition-colors">
                    <div>
                      <p className="text-foreground text-sm font-semibold">{villa.villaName}</p>
                      <p className="text-muted text-xs">Plot {villa.plotName}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={villa.transmittalsIssued > 0 ? "success" : "neutral"}>
                        {villa.transmittalsIssued} issued
                      </Badge>
                      {villa.draftTransmittals > 0 && (
                        <Badge variant="warning">
                          {villa.draftTransmittals} draft
                          {villa.draftTransmittals === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted text-xs">
                      {villa.lastIssuedAt
                        ? `Last issued ${formatDate(villa.lastIssuedAt)}`
                        : "Nothing issued yet"}
                    </p>
                  </Card>
                </Link>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
