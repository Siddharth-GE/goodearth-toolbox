import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { listProjectSchedules } from "@/lib/relay/queries";
import { slipLabel } from "@/lib/relay/schedule";
import { buildWave, waveAmpUnit } from "@/lib/relay/wave";
import { FolderOpen } from "lucide-react";
import Link from "next/link";

import { RelayNav } from "../_components/relay-nav";
import { WaveStageHeader, WaveSvg } from "../_components/wave-svg";

export default async function ProjectsPage() {
  const projects = await listProjectSchedules();

  // One ceiling across the page, so a busier project really does draw a
  // taller wave than the one above it.
  const ampUnit = waveAmpUnit(projects.map((p) => p.trails));

  return (
    <div className="space-y-5">
      <PageTitle
        title="Projects"
        description="Where each project's work is standing, and whether that is ahead of its plan or behind it."
      />
      <RelayNav active="projects" />

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          description="Projects come from Masters. Add one there and its schedule can be set here."
        />
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const wave = buildWave(project.schedule.stages, project.trails, {
              ampUnit,
              planPct: project.schedule.planPct,
            });
            return (
              <Link key={project.id} href={`/relay/projects/${project.id}`} className="block">
                <Card className="hover:border-accent/40 p-5 transition-colors">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-foreground text-base font-bold tracking-tight">
                      {project.name}
                    </h2>
                    {project.schedule.hasSchedule && (
                      <span className="text-muted text-xs">
                        {formatDate(project.schedule.startDay!)} →{" "}
                        {formatDate(project.schedule.endDay!)} · {project.schedule.totalWeeks} weeks
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-2">
                      {project.stuckTrails > 0 && (
                        <Badge variant="danger">{project.stuckTrails} cold</Badge>
                      )}
                      {project.trails.some((t) => !t.isFinished && t.isWithClient) && (
                        <Badge variant="warning">
                          {project.trails.filter((t) => !t.isFinished && t.isWithClient).length}{" "}
                          with client
                        </Badge>
                      )}
                      <Badge
                        variant={
                          !project.schedule.hasSchedule
                            ? "neutral"
                            : project.schedule.verdict === "behind"
                              ? "danger"
                              : project.schedule.verdict === "ahead"
                                ? "success"
                                : "info"
                        }
                      >
                        {slipLabel(project.schedule)}
                      </Badge>
                    </span>
                  </div>

                  {project.schedule.hasSchedule ? (
                    <>
                      {/* The same wave the villas inside are drawn as, for
                        the project as a whole: where its open work is
                        sitting across its own stages. The figures below
                        carry the plan-against-actual reading in words,
                        which is the part a curve cannot say. */}
                      {wave && (
                        <div className="mt-3">
                          <WaveStageHeader wave={wave} />
                          <WaveSvg model={wave} />
                        </div>
                      )}
                      <p className="text-muted mt-1 text-xs">
                        <span className="text-foreground font-medium">
                          {project.schedule.actualPct}% done
                        </span>{" "}
                        against{" "}
                        <span className="text-warning font-medium">
                          {project.schedule.planPct}% of the plan elapsed
                        </span>{" "}
                        · {project.liveTrails} trail{project.liveTrails === 1 ? "" : "s"} running
                      </p>
                    </>
                  ) : (
                    <p className="text-muted mt-2 text-sm">
                      No schedule set yet — open this project to set its start date and stages.
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
