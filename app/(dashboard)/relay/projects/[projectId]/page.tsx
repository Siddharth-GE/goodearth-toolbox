import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { PageTitle } from "@/components/ui/page-title";
import { getProjectSchedule, listProjectHouses } from "@/lib/relay/queries";
import { slipLabel } from "@/lib/relay/schedule";
import { buildWave, waveAmpUnit, type WaveTrail } from "@/lib/relay/wave";
import { ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";

import { RelayNav } from "../../_components/relay-nav";
import { TimerDial } from "../../_components/timer-dial";
import { ScheduleCard } from "./_components/schedule-card";
import { ScheduleEditor } from "./_components/schedule-editor";
import { StagePicker } from "../../_components/stage-picker";
import { VillaWaveBoard } from "./_components/villa-wave-board";

export default async function ProjectSchedulePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [data, houses] = await Promise.all([
    getProjectSchedule(projectId),
    listProjectHouses(projectId),
  ]);
  if (!data) notFound();

  const { project, schedule, trails, stages } = data;
  const unfiled = trails.filter((t) => t.projectStageId === null);

  // Every house gets an entry, even with nothing filed: a missing villa would read as "no such villa".
  const byUnit = new Map<string, WaveTrail[]>();
  for (const house of houses) byUnit.set(house.unitId, []);
  const wholeProject: WaveTrail[] = [];
  for (const t of trails) {
    const entry: WaveTrail = {
      projectStageId: t.projectStageId,
      isFinished: t.isFinished,
      isStuck: t.isStuck,
      isQueued: t.isQueued,
      isWithClient: t.isWithClient,
    };
    // Trails filed on the project itself (fire NOCs, master approvals) get their own row.
    if (t.unitId === null) {
      wholeProject.push(entry);
      continue;
    }
    const list = byUnit.get(t.unitId);
    if (list) list.push(entry);
    else byUnit.set(t.unitId, [entry]);
  }

  // One ceiling for the page so a taller wave means more open work.
  const ampUnit = waveAmpUnit([...byUnit.values(), wholeProject]);
  const waveOf = (rows: WaveTrail[]) =>
    buildWave(schedule.stages, rows, { ampUnit, planPct: schedule.planPct });

  // Trouble first, then work in flight, then landed: sorting by villa number makes someone read all forty-three.
  const RANK: Record<string, number> = {
    stuck: 0,
    withClient: 1,
    moving: 2,
    waiting: 3,
    complete: 4,
    quiet: 5,
  };
  const villaWaves = houses
    .map((house) => ({ house, wave: waveOf(byUnit.get(house.unitId) ?? []) }))
    .sort(
      (a, b) =>
        (RANK[a.wave?.status ?? "quiet"] ?? 5) - (RANK[b.wave?.status ?? "quiet"] ?? 5) ||
        a.house.unitName.localeCompare(b.house.unitName, undefined, { numeric: true }),
    );

  // Villas with nothing filed far outnumber those with work; they are named together at the bottom, not forty flat lines.
  const started = villaWaves.filter((v) => v.wave && v.wave.status !== "quiet");
  const untouched = villaWaves.filter((v) => !v.wave || v.wave.status === "quiet");

  const projectWave = wholeProject.length > 0 ? waveOf(wholeProject) : null;
  const headerWave =
    projectWave ?? started[0]?.wave ?? villaWaves.find((v) => v.wave)?.wave ?? null;

  const live = trails.filter((t) => !t.isFinished && !t.isQueued);

  return (
    <div className="space-y-5">
      <PageTitle
        backHref="/relay/projects"
        backLabel="Projects"
        title={project.name}
        description="Every villa, one glance. Each lane is that villa's open work across the stages."
        actions={
          <Badge
            variant={
              !schedule.hasSchedule
                ? "neutral"
                : schedule.verdict === "behind"
                  ? "danger"
                  : schedule.verdict === "ahead"
                    ? "success"
                    : "info"
            }
          >
            {slipLabel(schedule)}
          </Badge>
        }
      />
      <RelayNav active="projects" />

      {/* No rupees anywhere in Relay: it is about where work stands, not cost. */}
      <FigureBand className="lg:grid-cols-5">
        <FigureBandCell>
          <Figure label="Villas" value={houses.length} size="lg" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Running" value={live.length} size="lg" hint="a baton with someone" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Cold"
            value={live.filter((t) => t.isStuck).length}
            size="lg"
            tone={live.some((t) => t.isStuck) ? "bad" : undefined}
            hint="past its expected days"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="With client"
            value={live.filter((t) => t.isWithClient).length}
            size="lg"
            tone={live.some((t) => t.isWithClient) ? "warn" : undefined}
            hint="waiting on someone outside"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Waiting"
            value={trails.filter((t) => t.isQueued).length}
            size="lg"
            hint="written down, not started"
          />
        </FigureBandCell>
      </FigureBand>

      {headerWave ? (
        <div className="space-y-3">
          <VillaWaveBoard
            headerWave={headerWave}
            rows={[
              ...(projectWave
                ? [
                    {
                      key: "whole-project",
                      name: "The project as a whole",
                      href: `/relay/trails?project=${projectId}`,
                      wave: projectWave,
                    },
                  ]
                : []),
              ...started.flatMap(({ house, wave }) =>
                wave
                  ? [
                      {
                        key: house.unitId,
                        name: house.unitName,
                        href: `/relay/projects/${projectId}/houses/${house.unitId}`,
                        wave,
                      },
                    ]
                  : [],
              ),
            ]}
          />

          {/* One line, not 39 links: villas with no work are a fact about the project, not a list to read. */}
          {untouched.length > 0 && (
            <details className="group border-border bg-surface rounded-2xl border shadow-sm">
              <summary className="text-muted hover:text-foreground flex cursor-pointer list-none items-center gap-2 p-4 text-sm marker:content-none">
                <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" />
                <span>
                  <b className="text-foreground font-semibold">{untouched.length}</b> other villa
                  {untouched.length === 1 ? " has" : "s have"} no work on{" "}
                  {untouched.length === 1 ? "it" : "them"} yet
                </span>
              </summary>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 px-4 pb-4">
                {untouched.map(({ house }) => (
                  <Link
                    key={house.unitId}
                    href={`/relay/projects/${projectId}/houses/${house.unitId}`}
                    className="border-border text-muted hover:border-accent/40 hover:text-foreground rounded-lg border px-2.5 py-2 text-center text-xs font-medium transition-colors"
                  >
                    {house.unitName}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <Card className="p-4">
          <h2 className="text-foreground text-sm font-semibold">No stages set yet</h2>
          <p className="text-muted mt-0.5 text-sm">
            The waves need stages to run along. Set the start date and the stages below, and every
            villa gets its own line.
          </p>
        </Card>
      )}

      <ScheduleCard
        schedule={schedule}
        editor={
          <ScheduleEditor
            projectId={projectId}
            startDate={data.startDate}
            stages={schedule.stages}
          />
        }
      />

      {/* Only stragglers (trails under no stage) are listed: since 0065 trails file themselves, so a straggler is a real fault. */}
      {unfiled.length > 0 && (
        <Card className="border-warning/40 p-4">
          <h3 className="text-foreground text-sm font-semibold">
            {unfiled.length} trail{unfiled.length === 1 ? "" : "s"} not in any stage
          </h3>
          <p className="text-muted mt-0.5 text-sm">
            {unfiled.length === 1 ? "It counts" : "They count"} for nothing in the picture above
            until filed. Pick a stage for each.
          </p>
          <div className="divide-border mt-3 divide-y">
            {unfiled.map((trail) => (
              <TrailLine key={trail.chainId} trail={trail} stages={stages} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function TrailLine({
  trail,
  stages,
}: {
  trail: {
    chainId: string;
    activityName: string;
    title: string | null;
    unitName: string | null;
    holderName: string | null;
    daysInLeg: number;
    expectedDays: number;
    isFinished: boolean;
    isStuck: boolean;
    isQueued: boolean;
    projectStageId: string | null;
  };
  stages: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5">
      <Link href={`/relay/trails/${trail.chainId}`} className="min-w-0 flex-1">
        <p className="text-foreground hover:text-accent text-sm font-medium">
          {trail.activityName}
          {trail.title ? <span className="text-muted font-normal"> · {trail.title}</span> : null}
        </p>
        <p className="text-muted mt-0.5 text-xs">
          {trail.unitName ?? "The project as a whole"}
          {trail.isFinished
            ? " · finished"
            : trail.isQueued
              ? " · not started"
              : ` · with ${trail.holderName ?? "nobody"}`}
        </p>
      </Link>
      <StagePicker
        chainId={trail.chainId}
        stages={stages}
        current={trail.projectStageId}
        disabled={trail.isFinished}
      />
      {trail.isFinished ? (
        <Badge variant="success">Done</Badge>
      ) : trail.isQueued ? (
        // No dial: "0 of 4 days" would look like a started clock.
        <Badge variant="neutral">Waiting</Badge>
      ) : (
        <TimerDial days={trail.daysInLeg} expectedDays={trail.expectedDays} />
      )}
    </div>
  );
}
