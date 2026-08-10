import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getProjectSchedule, listProjectHouses } from "@/lib/relay/queries";
import { slipLabel } from "@/lib/relay/schedule";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";
import Link from "next/link";

import { RelayNav } from "../../_components/relay-nav";
import { TimerDial } from "../../_components/timer-dial";
import { ScheduleCard } from "./_components/schedule-card";
import { ScheduleEditor } from "./_components/schedule-editor";
import { StagePicker } from "./_components/stage-picker";

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

  return (
    <div className="space-y-5">
      <PageTitle
        backHref="/relay/projects"
        backLabel="Projects"
        title={project.name}
        description="Its schedule, and how far the work has actually got against it."
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

      {/* The picture, and the button that edits it. The editor used to
          sit open below here on every visit. */}
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

      {houses.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
            Houses — {houses.length}
          </h2>
          <Card className="divide-border divide-y">
            {houses.map((house) => (
              <Link
                key={house.unitId}
                href={`/relay/projects/${projectId}/houses/${house.unitId}`}
                className="flex items-center gap-3 p-3.5 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
              >
                <p className="text-foreground min-w-0 flex-1 text-sm font-medium">
                  {house.unitName}
                </p>
                {house.cold > 0 && <Badge variant="danger">{house.cold} cold</Badge>}
                <span className="text-muted text-xs">
                  {house.live + house.queued + house.finished === 0 ? (
                    "nothing yet"
                  ) : (
                    <>
                      {house.live} running
                      {house.queued > 0 ? ` · ${house.queued} waiting` : ""}
                      {house.finished > 0 ? ` · ${house.finished} done` : ""}
                    </>
                  )}
                </span>
              </Link>
            ))}
          </Card>
        </div>
      )}

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
