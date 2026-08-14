import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getProjectSchedule, listProjectHouses } from "@/lib/relay/queries";
import { slipLabel } from "@/lib/relay/schedule";
import { buildWave, waveAmpUnit, type WaveTrail } from "@/lib/relay/wave";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";
import Link from "next/link";

import { RelayNav } from "../../_components/relay-nav";
import { TimerDial } from "../../_components/timer-dial";
import { ScheduleCard } from "./_components/schedule-card";
import { ScheduleEditor } from "./_components/schedule-editor";
import { StagePicker } from "./_components/stage-picker";
import { WaveStageHeader } from "../../_components/wave-svg";
import { VillaWaveCard } from "./_components/villa-wave-card";

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

      {/* The waves. Stage names once above the stack — every villa shares
          one x-axis, so repeating them down the page is the same fact in
          eight times the ink. */}
      {headerWave ? (
        <div className="space-y-2">
          {/* Padded to line up with the villa cards below, whose waves
              sit inside their p-4. */}
          <WaveStageHeader wave={headerWave} className="px-4" />
          <div className="space-y-3">
            {projectWave && (
              <VillaWaveCard
                name="The project as a whole"
                href={`/relay/trails?project=${projectId}`}
                wave={projectWave}
              />
            )}
            {started.map(({ house, wave }) =>
              wave ? (
                <VillaWaveCard
                  key={house.unitId}
                  name={house.unitName}
                  href={`/relay/projects/${projectId}/houses/${house.unitId}`}
                  wave={wave}
                />
              ) : null,
            )}
          </div>

          {untouched.length > 0 && (
            <Card className="p-4">
              <h3 className="text-foreground text-sm font-semibold">
                {untouched.length} villa{untouched.length === 1 ? "" : "s"} with nothing filed yet
              </h3>
              <p className="text-muted mt-0.5 text-sm">
                No trails have been opened on {untouched.length === 1 ? "it" : "them"}. Open one to
                give {untouched.length === 1 ? "it a wave" : "them waves"}.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
                {untouched.map(({ house }) => (
                  <Link
                    key={house.unitId}
                    href={`/relay/projects/${projectId}/houses/${house.unitId}`}
                    className="text-muted hover:text-accent text-xs"
                  >
                    {house.unitName}
                  </Link>
                ))}
              </div>
            </Card>
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

      {schedule.stages.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
            Trails by stage
          </h2>
          {schedule.stages.map((stage) => {
            const inStage = trails.filter((t) => t.projectStageId === stage.id);
            return (
              <Card key={stage.id} className="p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={cn(
                      "size-2 shrink-0 self-center rounded-full",
                      stage.status === "done"
                        ? "bg-foreground"
                        : stage.status === "current"
                          ? "bg-warning"
                          : "bg-border",
                    )}
                  />
                  <h3 className="text-foreground text-sm font-semibold">{stage.name}</h3>
                  <span className="text-muted font-mono text-[11px]">
                    {stage.weeks}w · {formatDate(stage.startDay)} → {formatDate(stage.endDay)}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    {stage.trailsStuck > 0 && (
                      <Badge variant="danger">{stage.trailsStuck} cold</Badge>
                    )}
                    {/* Reads the same as the dashed block on the track:
                        nothing filed is not the same as nothing done.
                        Queued is called out separately because it is the
                        reason a stage can look far behind and be fine —
                        the work is written down, not started. */}
                    <span className="text-muted text-xs">
                      {stage.trailsTotal === 0
                        ? "Nothing filed here yet"
                        : `${stage.trailsFinished} of ${stage.trailsTotal} done`}
                      {stage.trailsQueued > 0 ? ` · ${stage.trailsQueued} waiting` : ""}
                    </span>
                  </span>
                </div>

                {inStage.length > 0 && (
                  <div className="divide-border mt-3 divide-y">
                    {inStage.map((trail) => (
                      <TrailLine key={trail.chainId} trail={trail} stages={stages} />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

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
