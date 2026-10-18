import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { Section } from "@/components/ui/section";
import type { EngagementDetail } from "@/lib/client-relations/queries";
import { formatCount, formatDate } from "@/lib/format";
import { Route } from "lucide-react";

/**
 * Design and site status, read-only, from Relay only; never typed here. Most plots have no trail filed, so the empty state must explain itself.
 * It never says "Foundation complete": pusher_chain_state exposes is_finished for a whole trail only, so counting trails is all it supports.
 */
export function RelayPanel({ engagement }: { engagement: EngagementDetail }) {
  const { trails } = engagement;
  const running = trails.filter((trail) => !trail.isFinished && !trail.isQueued);
  const stuck = running.filter((trail) => trail.isStuck);
  const finished = trails.filter((trail) => trail.isFinished);
  const queued = trails.filter((trail) => trail.isQueued);

  return (
    <div className="space-y-4">
      <Section
        title="Design"
        note="The only design fact recorded as data is the issued specification."
      >
        {engagement.issuedRevision === null ? (
          <p className="text-muted text-sm">
            No design revision has been issued for this plot yet.
          </p>
        ) : (
          <p className="text-foreground text-sm">
            Revision {engagement.issuedRevision} issued{" "}
            <span className="text-muted">{formatDate(engagement.issuedAt)}</span>
          </p>
        )}
      </Section>

      <Section
        title="On site"
        aside={
          <LinkButton href="/relay/projects" variant="ghost">
            Open Relay
          </LinkButton>
        }
      >
        {trails.length === 0 ? (
          <EmptyState
            icon={Route}
            title="No Relay trails filed for this villa yet"
            description="Site and design progress is tracked in Relay. Until a trail is filed against this villa, there is nothing here to show — this page never guesses."
          />
        ) : (
          <div className="space-y-4">
            <FigureBand>
              <FigureBandCell>
                <Figure label="Running" value={formatCount(running.length)} size="sm" />
              </FigureBandCell>
              <FigureBandCell>
                <Figure
                  label="Stuck"
                  value={formatCount(stuck.length)}
                  tone={stuck.length > 0 ? "bad" : undefined}
                  size="sm"
                />
              </FigureBandCell>
              <FigureBandCell>
                <Figure label="Not started" value={formatCount(queued.length)} size="sm" />
              </FigureBandCell>
              <FigureBandCell>
                <Figure label="Finished" value={formatCount(finished.length)} size="sm" />
              </FigureBandCell>
            </FigureBand>

            <ul className="space-y-2.5">
              {trails.map((trail) => (
                <li
                  key={trail.chainId}
                  className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-foreground text-sm font-medium">
                      {trail.title ?? trail.activityName ?? "Untitled trail"}
                    </p>
                    <p className="text-muted text-xs">
                      {trail.isQueued
                        ? "Not started"
                        : trail.isFinished
                          ? "Finished"
                          : `With ${trail.holderName ?? "nobody"}${
                              trail.daysInLeg !== null
                                ? ` · ${formatCount(trail.daysInLeg)} days`
                                : ""
                            }`}
                      {trail.legCount
                        ? ` · step ${formatCount(trail.currentLeg ?? 0)} of ${formatCount(trail.legCount)}`
                        : ""}
                    </p>
                  </div>
                  {trail.isFinished ? (
                    <Badge variant="success">Finished</Badge>
                  ) : trail.isStuck ? (
                    <Badge variant="danger">Stuck</Badge>
                  ) : trail.isQueued ? (
                    <Badge variant="neutral">Queued</Badge>
                  ) : (
                    <Badge variant="info">Running</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}
