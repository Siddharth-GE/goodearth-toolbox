import { Card } from "@/components/ui/card";
import type { ChainRow } from "@/lib/pusher/queries";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

import { TimerDial } from "./timer-dial";

/**
 * One baton in your hand. Deliberately a card and not a table row: this
 * screen is the one a site engineer opens on a phone between site
 * visits, and it should read as "here is what is yours today", not as a
 * report.
 *
 * A cold card carries the breathing danger ring — the same signal as the
 * dial inside it, because the whole point is that it cannot be scrolled
 * past.
 */
export function BatonCard({
  row,
  legLabel,
  actions,
}: {
  row: ChainRow;
  legLabel: string | null;
  actions: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-4",
        row.isStuck && "border-danger/40 [animation:pusher-breathe_2.6s_ease-in-out_infinite]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/pusher/trails/${row.chainId}`}
            className="text-foreground hover:text-accent text-sm font-semibold"
          >
            {row.activityName}
            {row.title ? ` · ${row.title}` : ""}
          </Link>
          <p className="text-muted mt-0.5 font-mono text-[10px] tracking-wider uppercase">
            {row.projectName}
            {row.unitName ? ` · ${row.unitName}` : ""}
          </p>
        </div>
        <TimerDial days={row.daysInLeg} expectedDays={row.expectedDays} />
      </div>

      <p className="text-muted text-sm">
        Your leg:{" "}
        <b className="text-foreground font-semibold">{legLabel ?? `Leg ${row.currentLeg}`}</b>
        {row.isStuck && (
          <>
            {" · "}
            <span className="text-danger font-semibold">
              {row.daysInLeg - row.expectedDays}d over
            </span>
          </>
        )}
      </p>

      {actions}
    </Card>
  );
}
