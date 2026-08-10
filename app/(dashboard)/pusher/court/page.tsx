import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { requireUser } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";
import {
  getLegsFor,
  getPusherPulse,
  listMyCourt,
  listPeople,
  listStrandedTrails,
} from "@/lib/pusher/queries";
import { CheckCircle2 } from "lucide-react";

import { BatonCard } from "../_components/baton-card";
import { CelebrateProvider } from "../_components/celebrate";
import { MoveBatonButtons } from "../_components/move-baton";
import { PusherNav } from "../_components/pusher-nav";
import { StrandedPanel } from "../_components/stranded-panel";

/**
 * Your court. Lives at /pusher/court rather than at /pusher because the
 * tool opens on Projects — a leader wants the project picture first, and
 * this page is the one you come to when a baton is in your hand.
 */
export default async function PusherCourtPage() {
  const user = await requireUser();
  const isAdmin = user.profile?.role === "admin";

  const [mine, pulse, people, stranded] = await Promise.all([
    listMyCourt(user.id),
    getPusherPulse(user.id),
    listPeople(),
    // Only an admin can do anything about a stranded baton, so only an
    // admin is shown one.
    isAdmin ? listStrandedTrails() : Promise.resolve([]),
  ]);

  const legsByChain = await getLegsFor(mine.map((row) => row.chainId));

  return (
    <CelebrateProvider>
      <div className="space-y-5">
        <PageTitle
          title="Your court"
          description="The batons in your hand, and how long each has been there."
          actions={<LinkButton href="/pusher/new">Open a trail</LinkButton>}
        />
        <PusherNav active="court" />

        {/* One band, not three stretched cards: these are three small
            numbers that belong together, and read as a single glance. */}
        <Card className="divide-border grid grid-cols-3 divide-x">
          <Stat label="live" value={pulse.live} />
          <Stat label="cold" value={pulse.cold} tone={pulse.cold > 0 ? "danger" : undefined} />
          <Stat label="in your hand" value={pulse.mine} />
        </Card>

        {isAdmin && stranded.length > 0 && <StrandedPanel rows={stranded} people={people} />}

        {mine.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Court cleared"
            description="Nothing is waiting on you. The flow moves without you today."
            action={<LinkButton href="/pusher/trails">See every trail</LinkButton>}
          />
        ) : (
          <div>
            <p className="text-muted mb-3 text-sm">
              <b className="text-foreground font-semibold">
                {mine.length} baton{mine.length === 1 ? "" : "s"}
              </b>{" "}
              in your hand
              {pulse.cold > 0 && mine.some((m) => m.isStuck) ? " — the cold ones are first." : "."}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((row) => {
                const legs = legsByChain.get(row.chainId) ?? [];
                const current = legs.find((l) => l.leg_no === row.currentLeg) ?? null;
                const next = legs.find((l) => l.leg_no === (row.currentLeg ?? 0) + 1) ?? null;
                const namesById = new Map(people.map((p) => [p.id, p.name]));

                return (
                  <BatonCard
                    key={row.chainId}
                    row={row}
                    legLabel={current?.label ?? null}
                    actions={
                      <MoveBatonButtons
                        size="sm"
                        people={people}
                        canPush={row.currentLeg !== null && row.currentLeg < row.legCount}
                        canBounce={(row.currentLeg ?? 1) > 1}
                        canFinish={row.currentLeg !== null && row.currentLeg === row.legCount}
                        canHand={false}
                        target={{
                          chainId: row.chainId,
                          fromLeg: row.currentLeg ?? 1,
                          legCount: row.legCount,
                          daysInLeg: row.daysInLeg,
                          expectedDays: row.expectedDays,
                          trailName: row.activityName,
                          nextLegLabel: next?.label ?? null,
                          nextLegAssignee: next ? (namesById.get(next.assignee_id) ?? null) : null,
                          nextLegDays: next?.expected_days ?? null,
                          bounceTargets: legs
                            .filter((l) => l.leg_no < (row.currentLeg ?? 1))
                            .map((l) => ({
                              legNo: l.leg_no,
                              label: l.label,
                              assigneeName: namesById.get(l.assignee_id) ?? "Unnamed",
                            })),
                        }}
                      />
                    }
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </CelebrateProvider>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="px-4 py-3.5">
      <p
        className={cn(
          "text-3xl font-extrabold tracking-tight",
          tone === "danger" ? "text-danger" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="text-muted mt-0.5 text-xs font-medium">{label}</p>
    </div>
  );
}
