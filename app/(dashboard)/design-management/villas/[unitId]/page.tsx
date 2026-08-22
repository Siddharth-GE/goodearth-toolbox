import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { getVillaDesignDetail } from "@/lib/design-management/queries";
import { getWorksTree } from "@/lib/masters/works";
import { FileStack } from "lucide-react";
import { notFound } from "next/navigation";

import { AddDrawingPicker } from "./_components/add-drawing-picker";
import { DrawingSetCard } from "./_components/drawing-set-card";
import { StageBoard } from "./_components/stage-board";

export default async function VillaDesignPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const [villa, tree] = await Promise.all([getVillaDesignDetail(unitId), getWorksTree()]);
  if (!villa) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title={villa.villaName}
        description={`Plot ${villa.plotName} · ${villa.projectName}`}
        backHref="/design-management/villas"
        backLabel="All villas"
      />

      <div className="space-y-2">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">Design stages</p>
        <StageBoard stages={villa.stageBoard} />
      </div>

      <div className="space-y-2">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">Drawing sets</p>
        {villa.setsWithRevisions.length === 0 ? (
          <EmptyState
            icon={FileStack}
            title="No drawings on this villa yet"
            description="Start one from a drawing set below."
          />
        ) : (
          <div className="space-y-3">
            {villa.setsWithRevisions.map((set) => (
              <DrawingSetCard key={set.setId} unitId={villa.unitId} set={set} tree={tree} />
            ))}
          </div>
        )}
      </div>

      <AddDrawingPicker unitId={villa.unitId} sets={villa.availableSets} />
    </div>
  );
}
