"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { ScheduleSummary } from "@/lib/relay/schedule";
import { cn } from "@/lib/utils";
import { SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";

import { SchedulePath } from "../../../_components/schedule-path";

/**
 * The project at a glance — and the only place its schedule is edited.
 *
 * The editor used to sit permanently open below this card, so the page
 * opened with a form nobody needed most visits, pushing the houses and
 * the trails below the fold. It is now one button on the picture it
 * edits, which is where you are already looking when you decide the plan
 * is wrong.
 *
 * A plain `useState`, not `useTransition`: the editor stays mounted
 * across the router.refresh() every save does, and isPending would grey
 * the whole thing out for as long as the refresh took (Relay's PLAN.md
 * records that one).
 */
export function ScheduleCard({
  schedule,
  editor,
}: {
  schedule: ScheduleSummary;
  /** Rendered on the server and passed in, so this stays a thin shell. */
  editor: ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Card className="p-5">
      {schedule.hasSchedule ? (
        <>
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
        </>
      ) : (
        <p className="text-muted text-sm">
          No schedule yet. Set a start date and stages and every date on this page works itself out
          from there.
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setEditing((open) => !open)}>
          <SlidersHorizontal className="size-4" />
          {editing ? "Done" : schedule.hasSchedule ? "Edit schedule" : "Set the schedule"}
        </Button>
      </div>

      {editing && <div className="border-border mt-3 border-t pt-4">{editor}</div>}
    </Card>
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
