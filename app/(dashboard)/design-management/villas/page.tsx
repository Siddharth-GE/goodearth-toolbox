import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listVillas } from "@/lib/design-management/queries";
import { ChevronRight, HardHat } from "lucide-react";
import Link from "next/link";

// One tappable row per villa, grouped by project — the Supervisors picker's
// shape (app/(dashboard)/supervisors/villas/page.tsx), anchored on the
// unit id rather than the plot id because this tool's own tables key off
// units, not plots.
export default async function DesignVillasPage() {
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
                <li key={villa.unitId}>
                  <Link
                    href={`/design-management/villas/${villa.unitId}`}
                    className="hover:bg-muted/5 flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <span>
                      <span className="text-foreground block text-sm font-medium">
                        {villa.villaName}
                      </span>
                      <span className="text-muted block text-xs">Plot {villa.plotName}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {villa.setsReleased > 0 && (
                        <Badge variant="success">
                          {villa.setsReleased} set{villa.setsReleased === 1 ? "" : "s"} released
                        </Badge>
                      )}
                      {villa.draftsOpen > 0 && (
                        <Badge variant="warning">
                          {villa.draftsOpen} draft{villa.draftsOpen === 1 ? "" : "s"}
                        </Badge>
                      )}
                      <ChevronRight className="text-muted size-4 shrink-0" />
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
