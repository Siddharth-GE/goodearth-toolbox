import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { requireUser } from "@/lib/auth/dal";
import { formatDate } from "@/lib/format";
import {
  bounceTargets,
  bounceReasonLabel,
  canBounce,
  canFinish,
  canHand,
  canPush,
  lastEvent,
} from "@/lib/pusher/events";
import { projectedFinishDay } from "@/lib/pusher/chain";
import { getTrail, listPeople } from "@/lib/pusher/queries";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";

import { CelebrateProvider } from "../../_components/celebrate";
import { MoveBatonButtons } from "../../_components/move-baton";
import { TrailRoute } from "../../_components/trail-route";

export default async function TrailPage({ params }: { params: Promise<{ chainId: string }> }) {
  const { chainId } = await params;
  const [user, trail, people] = await Promise.all([requireUser(), getTrail(chainId), listPeople()]);
  if (!trail) notFound();

  const actor = { userId: user.id, isAdmin: user.profile?.role === "admin" };
  const last = lastEvent(trail.events);
  const { state } = trail;
  const legCount = trail.legs.length;
  const namesById = new Map(people.map((p) => [p.id, p.name]));

  const current = trail.legs.find((l) => l.leg_no === state.currentLeg) ?? null;
  const next = trail.legs.find((l) => l.leg_no === (state.currentLeg ?? 0) + 1) ?? null;
  const finishBy = projectedFinishDay(state, new Date().toISOString());

  return (
    <CelebrateProvider>
      <div className="space-y-5">
        <PageTitle
          backHref="/pusher/trails"
          backLabel="All trails"
          title={
            <>
              {trail.activityName}
              {trail.title ? (
                <span className="text-muted font-normal"> · {trail.title}</span>
              ) : null}
            </>
          }
          description={
            <>
              {trail.projectName}
              {trail.unitName ? ` · ${trail.unitName}` : ""}
              {state.status === "running" && finishBy
                ? ` · on plan this finishes ${formatDate(finishBy)}`
                : ""}
            </>
          }
          actions={
            state.status === "finished" ? (
              <Badge variant="success">Done</Badge>
            ) : state.isStuck ? (
              <Badge variant="danger">Cold · {state.overBy}d over</Badge>
            ) : (
              <Badge variant="neutral">Warm</Badge>
            )
          }
        />

        {state.status === "running" && current && (
          <Card className={cn("p-4", state.isStuck && "border-danger/40")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted text-xs font-semibold tracking-widest uppercase">With</p>
                <p className="text-foreground mt-1 text-sm">
                  <b className="font-semibold">{namesById.get(current.assignee_id) ?? "Unnamed"}</b>{" "}
                  — {current.label} · day {state.daysInLeg} of {state.expectedDays}
                  {state.isStuck && (
                    <span className="text-danger font-semibold"> · {state.overBy}d over</span>
                  )}
                </p>
              </div>
              <MoveBatonButtons
                people={people}
                canPush={canPush(last, legCount, actor)}
                canBounce={canBounce(last, actor)}
                canFinish={canFinish(last, legCount, actor)}
                canHand={canHand(last, actor)}
                target={{
                  chainId,
                  fromLeg: state.currentLeg ?? 1,
                  legCount,
                  daysInLeg: state.daysInLeg,
                  expectedDays: state.expectedDays,
                  trailName: trail.activityName,
                  nextLegLabel: next?.label ?? null,
                  nextLegAssignee: next ? (namesById.get(next.assignee_id) ?? null) : null,
                  nextLegDays: next?.expected_days ?? null,
                  bounceTargets: bounceTargets(last).map((legNo) => {
                    const leg = trail.legs.find((l) => l.leg_no === legNo);
                    return {
                      legNo,
                      label: leg?.label ?? `Leg ${legNo}`,
                      assigneeName: leg ? (namesById.get(leg.assignee_id) ?? "Unnamed") : "—",
                    };
                  }),
                }}
              />
            </div>
          </Card>
        )}

        <Card>
          <div className="px-4 pt-4">
            <TrailRoute legs={state.legActuals} />
          </div>

          {/* One column, always. A trail is a sequence, and two columns
              made it read 1, 2 across then 3 below — the wrong order for
              the one thing this list is for. */}
          <div className="space-y-1.5 px-4 pb-4">
            {trail.legs.map((leg) => {
              const actual = state.legActuals.find((a) => a.legNo === leg.leg_no);
              const over = (actual?.overBy ?? 0) > 0;
              return (
                <div key={leg.leg_no} className="flex items-baseline gap-2 text-sm">
                  <span className="text-muted w-4 shrink-0 font-mono text-xs">{leg.leg_no}</span>
                  <span className="min-w-0">
                    <b className="text-foreground font-semibold">{leg.label}</b>{" "}
                    <span className="text-muted">· {leg.assigneeName}</span>
                    {(actual?.visits ?? 0) > 1 && (
                      <span className="text-muted text-xs"> · {actual?.visits} visits</span>
                    )}
                  </span>
                  <span className="text-muted ml-auto shrink-0 font-mono text-xs">
                    {actual && actual.status !== "ahead" ? (
                      <>
                        <span className={cn(over && "text-danger font-semibold")}>
                          {actual.daysSoFar}d
                        </span>
                        <span>/{leg.expected_days}d</span>
                      </>
                    ) : (
                      <>exp {leg.expected_days}d</>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="border-border divide-border divide-y border-t">
            {[...trail.events].reverse().map((e) => (
              <div key={e.seq} className="flex gap-3 px-4 py-3 text-sm">
                <span
                  className={cn(
                    "w-16 shrink-0 pt-0.5 font-mono text-[10px] tracking-wider uppercase",
                    e.kind === "pushed" && "text-success",
                    e.kind === "bounced" && "text-danger",
                    e.kind === "handed" && "text-warning",
                    (e.kind === "started" || e.kind === "completed") && "text-muted",
                  )}
                >
                  {e.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground">
                    {e.kind === "started" && (
                      <>
                        Trail opened — to{" "}
                        <b className="font-semibold">{legName(trail, e.to_leg)}</b>
                      </>
                    )}
                    {e.kind === "pushed" && (
                      <>
                        <b className="font-semibold">{e.actorName}</b> carried it to{" "}
                        <b className="font-semibold">{legName(trail, e.to_leg)}</b>
                      </>
                    )}
                    {e.kind === "bounced" && (
                      <>
                        <b className="font-semibold">{e.actorName}</b> sent it back to{" "}
                        <b className="font-semibold">{legName(trail, e.to_leg)}</b>{" "}
                        <Badge variant="danger">{bounceReasonLabel(e.reason)}</Badge>
                      </>
                    )}
                    {e.kind === "handed" && (
                      <>
                        <b className="font-semibold">{e.actorName}</b> handed the baton to{" "}
                        <b className="font-semibold">{e.toAssigneeName}</b>
                      </>
                    )}
                    {e.kind === "completed" && (
                      <>
                        <b className="font-semibold">{e.actorName}</b> finished the trail
                      </>
                    )}
                  </p>
                  {e.note && <p className="text-muted mt-0.5 text-sm">“{e.note}”</p>}
                </div>
                <span className="text-muted shrink-0 font-mono text-[10px]">
                  {formatDate(e.occurred_at)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </CelebrateProvider>
  );
}

function legName(trail: { legs: { leg_no: number; label: string }[] }, legNo: number | null) {
  if (legNo === null) return "the finish";
  return trail.legs.find((l) => l.leg_no === legNo)?.label ?? `leg ${legNo}`;
}
