import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Section } from "@/components/ui/section";
import {
  getVillaDesignDetail,
  listDesignStages,
  listVillaDrawingSetStates,
} from "@/lib/design-management/queries";
import { ChevronRight, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NewTransmittalDialog } from "./_components/new-transmittal-dialog";
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
 *
 * 2026-09-27: every set belongs to a stage and every transmittal sends
 * one set, so New transmittal asks for both, and each set row says its
 * stage.
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
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const stageOrder = new Map(stages.map((stage, index) => [stage.id, index]));
  // Grouped by stage in the stage list's own order; a set from before
  // sets had stages sorts last.
  const orderedSets = [...sets].sort(
    (a, b) =>
      (a.stageId ? (stageOrder.get(a.stageId) ?? 999) : 1000) -
      (b.stageId ? (stageOrder.get(b.stageId) ?? 999) : 1000),
  );

  return (
    <div className="space-y-4">
      <PageTitle
        title={villa.villaName}
        description={`Plot ${villa.plotName} · ${villa.projectName}`}
        backHref="/design-management/villas"
        backLabel="Villas"
        actions={
          <NewTransmittalDialog
            unitId={villa.unitId}
            stages={activeStages}
            sets={sets}
            defaultStageId={villa.transmittals[0]?.stageId ?? null}
          />
        }
      />

      {villa.transmittals.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Nothing has been sent to site for this villa yet"
          description="Press New transmittal, pick the stage and the drawing set, upload its sheets and issue it."
        />
      ) : (
        <Section title="Transmittals" note="Newest first. Open one to see what went out on it.">
          <TransmittalList transmittals={villa.transmittals} stages={villa.stages} />
        </Section>
      )}

      {sets.length > 0 && (
        <Section
          title="Drawing sets on this plot"
          note="Each set at its latest revision. Open one to see its sheets."
        >
          <ul className="divide-border divide-y">
            {orderedSets.map((set) => {
              const latest = set.draft ?? set.released;
              // A draft opens on the transmittal it is being prepared on;
              // a released set on the transmittal that sent it.
              const href = latest?.transmittalId
                ? `/design-management/transmittals/${latest.transmittalId}`
                : null;
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="text-foreground block text-sm">
                      {set.setCode ? `${set.setCode} — ${set.setName}` : set.setName}
                    </span>
                    <span className="text-muted block text-xs">
                      {set.stageId ? (stageNames.get(set.stageId) ?? "—") : "No stage"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted text-xs">
                      R{latest?.revisionNo ?? 0} · {latest?.fileCount ?? 0}{" "}
                      {latest?.fileCount === 1 ? "sheet" : "sheets"}
                    </span>
                    <Badge variant={set.draft ? "warning" : "success"}>
                      {set.draft ? "Draft" : "Released"}
                    </Badge>
                    {href && <ChevronRight className="text-muted size-4 shrink-0" />}
                  </span>
                </>
              );
              return (
                <li key={set.setId}>
                  {href ? (
                    <Link
                      href={href}
                      className="hover:bg-foreground/[0.025] -mx-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
