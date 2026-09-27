import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { listVillas } from "@/lib/design-management/queries";
import { HardHat } from "lucide-react";

import { VillaGrid } from "./_components/villa-grid";

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

  return (
    <div className="space-y-5">
      {header}
      <VillaGrid villas={villas} />
    </div>
  );
}
