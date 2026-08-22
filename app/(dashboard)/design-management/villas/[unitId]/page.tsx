import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Section } from "@/components/ui/section";
import {
  getVillaDesignDetail,
  listDesignStages,
  listVillaDrawingSetStates,
} from "@/lib/design-management/queries";
import { Send } from "lucide-react";
import { notFound } from "next/navigation";

import { CreateTransmittalDialog } from "./_components/create-transmittal-dialog";
import { TransmittalList } from "./_components/transmittal-list";

/**
 * The plot's home: every transmittal on this villa, and the drawing sets
 * that live here.
 *
 * Founder, 2026-08-22 evening: "person sees all villas (as cards) goes
 * into the villa there all transmittals of that plot, filters by group,
 * and then a new transmittal selector … there maybe a list of all
 * drawing sets released within a plot if that makes revision tracking
 * viable, not a master set for the whole damn project."
 *
 * So: the transmittals are the page, the sets list is a short reference
 * underneath it, and the stage board is gone — it said the same thing as
 * the list above it, one level less usefully.
 */
export default async function VillaDesignPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const [villa, stages, sets] = await Promise.all([
    getVillaDesignDetail(unitId),
    listDesignStages(),
    listVillaDrawingSetStates(unitId),
  ]);
  if (!villa) notFound();

  const activeStages = stages
    .filter((stage) => stage.isActive)
    .map((stage) => ({ id: stage.id, name: stage.name }));

  return (
    <div className="space-y-4">
      <PageTitle
        title={villa.villaName}
        description={`Plot ${villa.plotName} · ${villa.projectName}`}
        backHref="/design-management/villas"
        backLabel="Villas"
        actions={<CreateTransmittalDialog unitId={villa.unitId} stages={activeStages} />}
      />

      {villa.transmittals.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Nothing has been sent to site for this villa yet"
          description="Press New transmittal to start one, upload its drawings, and issue them."
        />
      ) : (
        <Section title="Transmittals" note="Newest first. Open one to see what went out on it.">
          <TransmittalList transmittals={villa.transmittals} stages={villa.stages} />
        </Section>
      )}

      {sets.length > 0 && (
        <Section
          title="Drawing sets on this plot"
          note="Each set at its latest revision. Open the transmittal that carried it to see the sheets."
        >
          <ul className="divide-border divide-y">
            {sets.map((set) => {
              const latest = set.draft ?? set.released;
              return (
                <li
                  key={set.setId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="text-foreground min-w-0 text-sm">
                    {set.setCode ? `${set.setCode} — ${set.setName}` : set.setName}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted text-xs">
                      R{latest?.revisionNo ?? 0} · {latest?.fileCount ?? 0}{" "}
                      {latest?.fileCount === 1 ? "file" : "files"}
                    </span>
                    <Badge variant={set.draft ? "warning" : "success"}>
                      {set.draft ? "Draft" : "Released"}
                    </Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
