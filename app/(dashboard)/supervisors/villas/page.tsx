import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listVillas } from "@/lib/supervisors/queries";
import { ChevronRight, HardHat } from "lucide-react";
import Link from "next/link";

// One tappable row per villa, grouped by project — the phone-first
// picker every supervisor starts from (founder, 2026-08-20: no plot
// assignment, everyone sees every villa).
export default async function VillasPage() {
  const villas = await listVillas();

  if (villas.length === 0) {
    return (
      <EmptyState
        icon={HardHat}
        title="No villas yet"
        description="Villas come from Masters — once units exist there, they show up here."
      />
    );
  }

  const projects = [...new Set(villas.map((villa) => villa.projectName))].sort();

  return (
    <div className="space-y-4">
      {projects.map((projectName) => (
        <Card key={projectName} className="p-0">
          <p className="text-muted border-border border-b px-4 py-2.5 text-xs font-medium tracking-wide uppercase">
            {projectName}
          </p>
          <ul className="divide-border divide-y">
            {villas
              .filter((villa) => villa.projectName === projectName)
              .map((villa) => (
                <li key={villa.plotId}>
                  <Link
                    href={`/supervisors/villas/${villa.plotId}`}
                    className="hover:bg-muted/5 flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <span>
                      <span className="text-foreground block text-sm font-medium">
                        {villa.villaName}
                      </span>
                      <span className="text-muted block text-xs">Plot {villa.plotName}</span>
                    </span>
                    <ChevronRight className="text-muted size-4 shrink-0" />
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
