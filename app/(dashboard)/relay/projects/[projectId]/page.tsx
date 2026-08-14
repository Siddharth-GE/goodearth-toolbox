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

  // A villa's trails, keyed by house. Every house in the project gets an
  // entry even with nothing filed against it — a villa missing from the
  // page would read as "no such villa" rather than "nothing started".
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
    // Trails filed against the project itself rather than a house — fire
    // NOCs, master approvals. They get their own row instead of vanishing.
    if (t.unitId === null) {
      wholeProject.push(entry);
      continue;
    }
    const list = byUnit.get(t.unitId);
    if (list) list.push(entry);
    else byUnit.set(t.unitId, [entry]);
  }

  // One ceiling for the whole page, so a taller wave really does mean
  // more open work than the villa above it.
  const ampUnit = waveAmpUnit([...byUnit.values(), wholeProject]);
  const waveOf = (rows: WaveTrail[]) =>
    buildWave(schedule.stages, rows, { ampUnit, planPct: schedule.planPct });

  // Trouble first, then work in flight, then what has landed. A project
  // list sorted by villa number makes someone read all forty-three to
  // find the two that need them, which is the opposite of one glance.
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

  // Villas with nothing filed at all are real, and there are usually far
  // more of them than villas with work — Saarang has forty-three houses
  // and four with anything on them. Drawing thirty-nine identical flat
  // lines would bury the four that matter, so they are named together at
  // the bottom instead of each taking a card.
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

      {/* Counts, then the picture. No rupees anywhere in Relay — this
          tool is about where work is standing, not what it cost. */}
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

      {/* The waves: one board, the stage names written once across its
          top, every villa a row beneath — names and curves share one
          surface instead of the names floating in page-space. */}
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

          {/* One line, not thirty-nine links.
              These villas have no work on them, which is a fact about
              the project and not a list anyone came here to read — the
              first version printed every name as a blue link and turned
              the bottom of the page into a drawer of junk. It opens if
              someone actually wants to reach one. */}
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
              {/* Tiles, not a wall of blue links: each villa is a small
                  quiet button in an even grid, so the open drawer still
                  looks designed rather than dumped. */}
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

      {/* The plan, against which all of the above is running late or not.
          Below the waves now: the wave is what someone opens this page
          for, the schedule is what they check second. */}
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

      {/* "Trails by stage" used to be listed out here — every trail under
          every stage, the founder's call to remove it: the waves already
          say where the work is, a trail's own page is where it is acted
          on, and since 0065 trails file themselves, so the workbench for
          filing them had nothing left to do. Only the stragglers panel
          below survives, because a straggler is a real, fixable fault. */}
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
        // No dial: it would read "0 of 4 days" and look like a clock that
        // had started, which is the one thing the queue must never imply.
        <Badge variant="neutral">Waiting</Badge>
      ) : (
        <TimerDial days={trail.daysInLeg} expectedDays={trail.expectedDays} />
      )}
    </div>
  );
}
