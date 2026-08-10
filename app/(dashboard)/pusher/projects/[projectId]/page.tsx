import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getProjectSchedule } from "@/lib/pusher/queries";
import { slipLabel } from "@/lib/pusher/schedule";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";
import Link from "next/link";

import { PusherNav } from "../../_components/pusher-nav";
import { SchedulePath } from "../../_components/schedule-path";
import { TimerDial } from "../../_components/timer-dial";
import { ScheduleEditor } from "./_components/schedule-editor";
import { StagePicker } from "./_components/stage-picker";

export default async function ProjectSchedulePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const data = await getProjectSchedule(projectId);
  if (!data) notFound();

  const { project, schedule, trails, stages } = data;
  const unfiled = trails.filter((t) => t.projectStageId === null);

  return (
    <div className="space-y-5">
      <PageTitle
        backHref="/pusher/projects"
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
      <PusherNav active="projects" />

      {schedule.hasSchedule && (
        <Card className="p-5">
          <SchedulePath schedule={schedule} />
          <div className="border-border mt-3 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
            <Figure label="work done" value={`${schedule.actualPct}%`} />
            <Figure label="of the plan elapsed" value={`${schedule.planPct}%`} tone="warning" />
            <Figure
              label={schedule.verdict === "ahead" ? "weeks ahead" : "weeks behind"}
              value={String(Math.abs(schedule.slipWeeks))}
              tone={schedule.verdict === "behind" ? "danger" : undefined}
            />
            <Figure label="finishes" value={schedule.endDay ? formatDate(schedule.endDay) : "—"} />
          </div>
        </Card>
      )}

      <ScheduleEditor projectId={projectId} startDate={data.startDate} stages={schedule.stages} />

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
                    <span className="text-muted text-xs">
                      {stage.trailsFinished} of {stage.trailsTotal} done
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
    projectStageId: string | null;
  };
  stages: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5">
      <Link href={`/pusher/trails/${trail.chainId}`} className="min-w-0 flex-1">
        <p className="text-foreground hover:text-accent text-sm font-medium">
          {trail.activityName}
          {trail.title ? <span className="text-muted font-normal"> · {trail.title}</span> : null}
        </p>
        <p className="text-muted mt-0.5 text-xs">
          {trail.unitName ?? "The project as a whole"}
          {trail.isFinished ? " · finished" : ` · with ${trail.holderName ?? "nobody"}`}
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
      ) : (
        <TimerDial days={trail.daysInLeg} expectedDays={trail.expectedDays} />
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div>
      <p
        className={cn(
          "text-xl font-extrabold tracking-tight",
          tone === "danger"
            ? "text-danger"
            : tone === "warning"
              ? "text-warning"
              : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="text-muted mt-0.5 text-xs">{label}</p>
    </div>
  );
}
