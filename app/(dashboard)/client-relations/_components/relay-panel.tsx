import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { Section } from "@/components/ui/section";
import type { EngagementDetail } from "@/lib/client-relations/queries";
import { formatCount, formatDate } from "@/lib/format";
import { Route } from "lucide-react";

/**
 * Design and site status, read-only, straight from Relay.
 *
 * The founder's instruction was that these come from Relay ONLY and are
 * never typed here. That decision has a visible cost and this component
 * is where it lands: on the day this shipped, 4 of Saarang's 43 villas
 * had any trail filed at all. So the empty state is not an afterthought —
 * it is what most plots will show, and it has to explain itself rather
 * than look like a page that failed to load.
 *
 * WHAT THIS DELIBERATELY DOES NOT SAY: "Foundation complete", or anything
 * else about a particular activity. `pusher_chain_state` exposes
 * is_finished for a WHOLE trail only; there is no per-activity completion
 * anywhere in Relay, and project_stages is per-project rather than
 * per-villa. Counting trails is the honest thing this data supports.
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
          <LinkButton href="/relay" variant="ghost">
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
