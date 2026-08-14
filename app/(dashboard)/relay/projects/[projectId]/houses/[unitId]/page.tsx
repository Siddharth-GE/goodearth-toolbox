import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { PageTitle } from "@/components/ui/page-title";
import { getHouse, listTrailSets } from "@/lib/relay/queries";
import { buildSchedule } from "@/lib/relay/schedule";
import { buildWave, waveAmpUnit, type WaveTrail } from "@/lib/relay/wave";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";

import { RelayNav } from "../../../../_components/relay-nav";
import { TrailCard } from "../../../../_components/trail-card";
import { WaveSvg } from "../../../../_components/wave-svg";
import { HouseQueue } from "./_components/house-queue";

/**
 * One house. The screen the standard set lands on, split into what is
 * running and what is waiting — and they are kept visually apart on
 * purpose, because the difference between "nobody has touched this in
 * eleven days" and "this has not started" is the whole point of the
 * queue.
 */
export default async function HousePage({
  params,
}: {
  params: Promise<{ projectId: string; unitId: string }>;
}) {
  const { projectId, unitId } = await params;
  const [house, sets] = await Promise.all([getHouse(projectId, unitId), listTrailSets()]);
  if (!house) notFound();

  const cold = house.running.filter((t) => t.isStuck).length;
  const withClient = house.running.filter((t) => t.isWithClient).length;

  // This house's own wave, on the same axis as its project page — the
  // stages and the "today" marker come from the project's plan, so the
  // big wave here and the small one there agree.
  const waveTrails: WaveTrail[] = house.trails.map((t) => ({
    projectStageId: t.projectStageId,
    isFinished: t.isFinished,
    isStuck: t.isStuck,
    isQueued: t.isQueued,
    isWithClient: t.isWithClient,
  }));
  const schedule = buildSchedule(
    house.stages,
    waveTrails,
    house.startDate,
    new Date().toISOString(),
  );
  const wave = buildWave(schedule.stages, waveTrails, {
    ampUnit: waveAmpUnit([waveTrails]),
    planPct: schedule.hasSchedule ? schedule.planPct : null,
  });

  return (
    <div className="space-y-5">
      <PageTitle
        backHref={`/relay/projects/${projectId}`}
        backLabel={house.project.name}
        title={house.unit.name}
        description="Everything this house is waiting on, and everything already moving."
        actions={
          <div className="flex items-center gap-2">
            {cold > 0 && <Badge variant="danger">{cold} cold</Badge>}
            {/* Both pickers arrive answered, so opening a one-off trail
                on a house is not a trip back through Project and Unit. */}
            <LinkButton href={`/relay/new?project=${projectId}&unit=${unitId}`}>
              Open a trail
            </LinkButton>
          </div>
        }
      />
      <RelayNav active="projects" />

      {/* The house's own wave, big enough to carry its stage names. */}
      {wave && (
        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
              Where the work is
            </h2>
            <span
              className={cn(
                "text-xs font-medium",
                wave.status === "stuck"
                  ? "text-danger"
                  : wave.status === "withClient"
                    ? "text-warning"
                    : wave.status === "complete"
                      ? "text-success"
                      : "text-muted",
              )}
            >
              {wave.label}
            </span>
          </div>
          <div className="mt-2">
            <WaveSvg model={wave} size="lg" />
          </div>
          {wave.unfiledOpen > 0 && (
            <p className="text-warning mt-1 text-xs">
              {wave.unfiledOpen} open trail{wave.unfiledOpen === 1 ? " is" : "s are"} not filed
              under a stage, so {wave.unfiledOpen === 1 ? "it does" : "they do"} not appear on the
              wave.
            </p>
          )}
        </Card>
      )}

      <FigureBand className="lg:grid-cols-5">
        <FigureBandCell>
          <Figure label="Running" value={house.running.length} size="lg" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Cold" value={cold} size="lg" tone={cold > 0 ? "bad" : undefined} />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="With client"
            value={withClient}
            size="lg"
            tone={withClient > 0 ? "warn" : undefined}
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Waiting" value={house.queued.length} size="lg" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Done" value={house.finished.length} size="lg" />
        </FigureBandCell>
      </FigureBand>

      <div>
        <h2 className="text-muted mb-2 text-xs font-semibold tracking-widest uppercase">Running</h2>
        {house.running.length === 0 ? (
          <Card className="p-4">
            <p className="text-muted text-sm">
              Nothing is moving on this house yet. Start something from the waiting list below.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {house.running.map((trail) => (
              <TrailCard key={trail.chainId} row={trail} showUnit={false} />
            ))}
          </div>
        )}
      </div>

      <HouseQueue
        projectId={projectId}
        unitId={unitId}
        queued={house.queued}
        sets={sets.map((s) => ({ id: s.id, name: s.name, count: s.activities.length }))}
      />

      {house.finished.length > 0 && (
        <div>
          <h2 className="text-muted mb-2 text-xs font-semibold tracking-widest uppercase">Done</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {house.finished.map((trail) => (
              <TrailCard key={trail.chainId} row={trail} showUnit={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
