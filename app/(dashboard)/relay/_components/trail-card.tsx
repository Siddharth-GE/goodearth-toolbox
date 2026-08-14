import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ChainRow } from "@/lib/relay/queries";
import { cn } from "@/lib/utils";
import Link from "next/link";

import { TimerDial } from "./timer-dial";

/**
 * One trail, as a card.
 *
 * The same block had been hand-written three times — the all-trails list,
 * the house's running list, the house's done list — each with a slightly
 * different arrangement of the same five facts. DESIGN.md's rule is to
 * build the third copy into a shared component.
 *
 * A card rather than a table row because these lists are read on a phone
 * at site, where a row of columns becomes a wrap of orphaned words. The
 * baton card next door made the same call for the same reason; this is
 * its quieter sibling, for trails you are looking at rather than holding.
 */
export function TrailCard({
  row,
  showProject = false,
  showUnit = true,
}: {
  row: ChainRow;
  showProject?: boolean;
  showUnit?: boolean;
}) {
  const context = [showProject ? row.projectName : null, showUnit ? row.unitName : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      className={cn(
        "transition-colors",
        // No breathing here. The court breathes because there is a button
        // to press; a list that pulses is just an alarm to scroll past.
        row.isStuck && !row.isFinished && "border-danger/40",
      )}
    >
      <Link
        href={`/relay/trails/${row.chainId}`}
        className="flex h-full items-start gap-3 p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
      >
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">
            {row.activityName}
            {row.title ? <span className="text-muted font-normal"> · {row.title}</span> : null}
          </p>
          {context ? (
            <p className="text-muted mt-0.5 font-mono text-[10px] tracking-wider uppercase">
              {context}
            </p>
          ) : null}
          <p className="text-muted mt-1 text-xs">
            {row.isFinished ? (
              "finished"
            ) : row.isQueued ? (
              `${row.legCount} ${row.legCount === 1 ? "activity" : "activities"} · not started`
            ) : (
              <>
                with <b className="text-foreground font-medium">{row.holderName ?? "nobody"}</b>
                {row.currentLeg ? ` · leg ${row.currentLeg} of ${row.legCount}` : ""}
              </>
            )}
          </p>
          {row.departments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {row.departments.map((d) => (
                <Badge key={d} variant="neutral">
                  {d}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {row.isFinished ? (
          <Badge variant="success">Done</Badge>
        ) : row.isQueued ? (
          // Never a dial on a queued trail: it would read "0 of 4 days"
          // and look like a clock that had already started.
          <Badge variant="neutral">Waiting</Badge>
        ) : (
          <TimerDial days={row.daysInLeg} expectedDays={row.expectedDays} />
        )}
      </Link>
    </Card>
  );
}
