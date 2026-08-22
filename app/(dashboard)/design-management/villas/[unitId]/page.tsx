import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { getVillaDesignDetail, listDesignStages } from "@/lib/design-management/queries";
import { FileStack } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateTransmittalDialog } from "./_components/create-transmittal-dialog";
import { DrawingSetCard } from "./_components/drawing-set-card";
import { StageBoard } from "./_components/stage-board";

/**
 * The villa's record of what has gone to site: the stage board, and each
 * drawing set's released history. Nothing here is editable.
 *
 * Founder, 2026-08-22, on the staging vet: "in the overview you just see
 * what's been issued". The work — starting a revision, uploading sheets,
 * revising a set — happens on a transmittal, which "New transmittal"
 * opens.
 */
export default async function VillaDesignPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const [villa, stages] = await Promise.all([getVillaDesignDetail(unitId), listDesignStages()]);
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
        backLabel="All villas"
        actions={<CreateTransmittalDialog unitId={villa.unitId} stages={activeStages} />}
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            Design stages
          </p>
          <Link
            href={`/design-management/transmittals?villa=${villa.unitId}`}
            className="text-accent text-sm font-medium hover:underline"
          >
            Transmittals for this villa
          </Link>
        </div>
        <StageBoard stages={villa.stageBoard} />
      </div>

      <div className="space-y-2">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">
          Drawings issued
        </p>
        {villa.setsWithRevisions.length === 0 ? (
          <EmptyState
            icon={FileStack}
            title="Nothing has gone to site for this villa yet"
            description="Press New transmittal to put the first drawings together and issue them."
          />
        ) : (
          <div className="space-y-3">
            {villa.setsWithRevisions.map((set) => (
              <DrawingSetCard key={set.setId} set={set} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
