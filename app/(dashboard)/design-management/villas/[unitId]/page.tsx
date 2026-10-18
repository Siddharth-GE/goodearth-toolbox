import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Faces, Pill } from "@/components/ui/pill";
import { Section } from "@/components/ui/section";
import { getVillaBoard } from "@/lib/design-management/board-queries";
import {
  getVillaDesignDetail,
  listDesignStages,
  listVillaDrawingSetStates,
} from "@/lib/design-management/queries";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DesignBoardProvider } from "../../_components/board-context";
import { ActionCard } from "../../_components/action-card";
import { Composer } from "../../_components/composer";
import { HealthPill, StageRail } from "../../_components/lot-card";
import { NewTransmittalDialog } from "./_components/new-transmittal-dialog";
import { TransmittalList } from "./_components/transmittal-list";
import { VillaHistory } from "./_components/villa-history";
import { VillaStages } from "./_components/villa-stages";

export default async function VillaDesignPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const [board, villa, stages, sets] = await Promise.all([
    getVillaBoard(unitId),
    getVillaDesignDetail(unitId),
    listDesignStages(),
    listVillaDrawingSetStates(unitId),
  ]);
  if (!board || !villa) notFound();

  const { card } = board;
  const activeStages = stages
    .filter((stage) => stage.isActive)
    .map((stage) => ({ id: stage.id, name: stage.name }));
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const stageOrder = new Map(stages.map((stage, index) => [stage.id, index]));
  // Grouped by stage in the master's order; a set from before sets had stages sorts last.
  const orderedSets = [...sets].sort(
    (a, b) =>
      (a.stageId ? (stageOrder.get(a.stageId) ?? 999) : 1000) -
      (b.stageId ? (stageOrder.get(b.stageId) ?? 999) : 1000),
  );
  const open = board.actions.filter((action) => action.status !== "done").length;
  const onTeam = board.team.some((person) => person.id === board.me.id);
  const defaultOwner = card.people[0]?.id ?? (onTeam ? board.me.id : null);
  const currentStageId = card.place.index >= 0 ? board.stages[card.place.index].id : null;

  return (
    <DesignBoardProvider
      today={board.today}
      team={board.team}
      villas={board.villas}
      stages={board.stages}
      openByOwner={board.openByOwner}
      meId={board.me.id}
      isManager={board.me.isManager}
    >
      <div className="space-y-4">
        <Link
          href="/design-management/villas"
          className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" /> Board
        </Link>

        <Card className="flex flex-wrap items-start gap-x-5 gap-y-3 p-5">
          <div className="shrink-0">
            <p className="text-muted text-[10px] font-medium tracking-[0.14em] uppercase">Plot</p>
            <p className="text-foreground font-mono text-4xl leading-none font-bold tracking-tight">
              {card.number}
            </p>
          </div>
          <div className="min-w-0 flex-1 basis-64">
            <p
              className={
                card.clientName
                  ? "text-foreground font-display text-2xl font-medium"
                  : "text-muted font-display text-2xl font-medium"
              }
            >
              {card.clientName ?? "No buyer yet"}
            </p>
            <div className="text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>
                {villa.villaName} · Plot {villa.plotName} · {villa.projectName}
              </span>
              <HealthPill health={card.health} />
              {card.place.index >= 0 ? (
                <Pill tone="ink">
                  {card.place.complete ? "Design complete" : `At ${card.placeName}`}
                </Pill>
              ) : null}
              {card.people.length > 0 ? <Faces names={card.people.map((p) => p.name)} /> : null}
            </div>
            {card.revising.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {card.revising.map((label) => (
                  <Pill key={label} tone="danger">
                    {label}
                  </Pill>
                ))}
              </div>
            ) : null}
            {board.stages.length > 0 ? (
              <StageRail rail={card.rail} labels className="mt-3 max-w-lg" />
            ) : null}
          </div>
        </Card>

        {board.stages.length > 0 ? (
          <VillaStages unitId={unitId} steps={board.steps} />
        ) : (
          <p className="text-muted text-sm">
            No stage is on the design board yet — tick On the board in Design stages.
          </p>
        )}

        <Section title="Next steps" aside={<Pill>{open} open</Pill>}>
          <div className="space-y-2">
            {board.actions.length === 0 ? (
              <p className="text-muted text-sm">No actions yet. Add the next step below.</p>
            ) : (
              board.actions.map((action) => (
                <ActionCard key={action.id} action={action} showVilla={false} />
              ))
            )}
            <div className="pt-1">
              <Composer
                fixedVilla={unitId}
                defaultOwner={defaultOwner}
                defaultStage={currentStageId}
              />
            </div>
          </div>
        </Section>

        <Section
          title="Transmittals"
          note="Newest first. Open one to see what went out on it."
          aside={
            <NewTransmittalDialog
              unitId={villa.unitId}
              stages={activeStages}
              sets={sets}
              defaultStageId={villa.transmittals[0]?.stageId ?? null}
            />
          }
        >
          {villa.transmittals.length === 0 ? (
            <EmptyState
              icon={Send}
              title="Nothing has been sent to site for this villa yet"
              description="Press New transmittal, pick the stage and the drawing set, paste the WorkDrive link to its sheets and issue it."
            />
          ) : (
            <TransmittalList transmittals={villa.transmittals} stages={villa.stages} />
          )}
        </Section>

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

        <Section title="History" note="Every move on this villa, newest first." collapsible>
          <VillaHistory lines={board.history} />
        </Section>
      </div>
    </DesignBoardProvider>
  );
}
