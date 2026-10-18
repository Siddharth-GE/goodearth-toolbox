import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ChainRow } from "@/lib/relay/queries";
import { cn } from "@/lib/utils";
import Link from "next/link";

import { TimerDial } from "./timer-dial";

/** One trail as a card, shared by the three lists (DESIGN.md's third-copy rule). A card, not a row: read on a phone at site. */
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
        // No breathing: the court breathes because there is a button to press; a pulsing list is an alarm to scroll past.
        row.isStuck && !row.isFinished && "border-danger/40",
      )}
    >
      <Link
        href={`/relay/trails/${row.chainId}`}
        className="hover:bg-foreground/[0.05] flex h-full items-start gap-3 p-4"
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
          {row.isWithClient && !row.isFinished && (
            <p className="text-warning mt-1 text-xs font-medium">
              with client · {row.withClientDays}d
            </p>
          )}
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
          // No dial on a queued trail: "0 of 4 days" would look like a running clock.
          <Badge variant="neutral">Waiting</Badge>
        ) : (
          <TimerDial days={row.daysInLeg} expectedDays={row.expectedDays} />
        )}
      </Link>
    </Card>
  );
}
