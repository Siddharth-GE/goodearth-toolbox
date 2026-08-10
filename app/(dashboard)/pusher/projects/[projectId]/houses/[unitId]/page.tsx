import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { getHouse, listTrailSets } from "@/lib/pusher/queries";
import { notFound } from "next/navigation";
import Link from "next/link";

import { PusherNav } from "../../../../_components/pusher-nav";
import { TimerDial } from "../../../../_components/timer-dial";
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

  return (
    <div className="space-y-5">
      <PageTitle
        backHref={`/pusher/projects/${projectId}`}
        backLabel={house.project.name}
        title={house.unit.name}
        description="Everything this house is waiting on, and everything already moving."
        actions={
          <div className="flex items-center gap-2">
            {cold > 0 && <Badge variant="danger">{cold} cold</Badge>}
            {/* Both pickers arrive answered, so opening a one-off trail
                on a house is not a trip back through Project and Unit. */}
            <LinkButton href={`/pusher/new?project=${projectId}&unit=${unitId}`}>
              Open a trail
            </LinkButton>
          </div>
        }
      />
      <PusherNav active="projects" />

      <Card className="divide-border grid grid-cols-4 divide-x">
        <Stat label="running" value={house.running.length} />
        <Stat label="cold" value={cold} tone={cold > 0 ? "danger" : undefined} />
        <Stat label="waiting" value={house.queued.length} />
        <Stat label="done" value={house.finished.length} />
      </Card>

      <div>
        <h2 className="text-muted mb-2 text-xs font-semibold tracking-widest uppercase">Running</h2>
        {house.running.length === 0 ? (
          <Card className="p-4">
            <p className="text-muted text-sm">
              Nothing is moving on this house yet. Start something from the waiting list below.
            </p>
          </Card>
        ) : (
          <Card className="divide-border divide-y">
            {house.running.map((trail) => (
              <Link
                key={trail.chainId}
                href={`/pusher/trails/${trail.chainId}`}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">
                    {trail.activityName}
                    {trail.title ? (
                      <span className="text-muted font-normal"> · {trail.title}</span>
                    ) : null}
                  </p>
                  <p className="text-muted mt-0.5 text-xs">
                    with{" "}
                    <b className="text-foreground font-medium">{trail.holderName ?? "nobody"}</b>
                    {trail.currentLeg ? ` · leg ${trail.currentLeg} of ${trail.legCount}` : ""}
                  </p>
                </div>
                <TimerDial days={trail.daysInLeg} expectedDays={trail.expectedDays} />
              </Link>
            ))}
          </Card>
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
          <Card className="divide-border divide-y">
            {house.finished.map((trail) => (
              <Link
                key={trail.chainId}
                href={`/pusher/trails/${trail.chainId}`}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
              >
                <p className="text-foreground min-w-0 flex-1 text-sm font-medium">
                  {trail.activityName}
                  {trail.title ? (
                    <span className="text-muted font-normal"> · {trail.title}</span>
                  ) : null}
                </p>
                <Badge variant="success">Done</Badge>
              </Link>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="px-4 py-3.5">
      <p
        className={
          tone === "danger"
            ? "text-danger text-2xl font-extrabold tracking-tight"
            : "text-foreground text-2xl font-extrabold tracking-tight"
        }
      >
        {value}
      </p>
      <p className="text-muted mt-0.5 text-xs font-medium">{label}</p>
    </div>
  );
}
