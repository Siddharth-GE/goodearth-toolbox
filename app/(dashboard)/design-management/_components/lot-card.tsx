import { Card } from "@/components/ui/card";
import { Faces, Pill, type PillTone } from "@/components/ui/pill";
import {
  VILLA_HEALTH,
  stepStatus,
  type RailSegment,
  type StepStatus,
} from "@/lib/design-management/board";
import type { VillaCard } from "@/lib/design-management/board-queries";
import { dueLabel } from "@/lib/next-steps/rules";
import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * A villa on the board, Client Relations' lot card in design's terms: its
 * plot number large and monospaced, the client, a health pill, a rail with
 * a segment per board stage, where it sits and for how long, any earlier
 * stage being revised, the next action, and the faces on its stage. The
 * whole card opens the villa.
 */

const SEGMENT: Record<StepStatus, string | null> = {
  not_started: null,
  working: "bg-info",
  with_client: "bg-warning",
  waiting: "bg-warning",
  revising: "bg-danger",
  done: "bg-accent",
};

export function StageRail({
  rail,
  labels = false,
  className,
}: {
  rail: RailSegment[];
  /** Each stage's name under its segment — the villa's own header. */
  labels?: boolean;
  className?: string;
}) {
  const description = rail
    .map((segment) => `${segment.name}: ${stepStatus(segment.status).label.toLowerCase()}`)
    .join(", ");
  return (
    <div
      role="img"
      aria-label={description}
      className={cn("grid gap-1", className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(rail.length, 1)}, minmax(0, 1fr))` }}
    >
      {rail.map((segment) => {
        const fill = SEGMENT[segment.status];
        return (
          <span key={segment.stageId} className="min-w-0">
            <span className="bg-foreground/[0.08] block h-1.5 overflow-hidden rounded-full">
              {fill ? <span className={cn("block h-full rounded-full", fill)} /> : null}
            </span>
            {labels ? (
              <span className="text-muted mt-1 block truncate text-[11px]" aria-hidden="true">
                {segment.name}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export function HealthPill({ health }: { health: VillaCard["health"] }) {
  if (!health) return null;
  const { label, tone } = VILLA_HEALTH[health];
  return (
    <Pill tone={tone} className="h-6 gap-1 px-2 text-[11px]">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </Pill>
  );
}

const DUE_TONE: Record<string, PillTone> = {
  danger: "danger",
  info: "info",
  neutral: "plain",
  success: "success",
};

export function LotCard({ card, today }: { card: VillaCard; today: string }) {
  const next = card.next ? dueLabel({ ...card.next }, today) : null;
  const current = card.currentStatus ? stepStatus(card.currentStatus) : null;

  return (
    <Link
      href={`/design-management/villas/${card.unitId}`}
      className="focus-visible:ring-accent/25 block rounded-2xl focus-visible:ring-4 focus-visible:outline-none"
    >
      <Card interactive className="flex h-full min-w-0 flex-col gap-2.5 p-3.5">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0">
            <p className="text-muted text-[10px] font-medium tracking-[0.14em] uppercase">Plot</p>
            <p className="text-foreground font-mono text-2xl leading-none font-bold tracking-tight">
              {card.number}
            </p>
          </div>
          <span className="ml-auto">
            <HealthPill health={card.health} />
          </span>
        </div>

        <div className="min-w-0">
          <p
            className={cn(
              "line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight",
              !card.clientName && "text-muted font-medium",
            )}
          >
            {card.clientName ?? "No buyer yet"}
          </p>
          <p className="text-muted mt-0.5 truncate text-xs">{card.villaName}</p>
        </div>

        <div className="space-y-1.5">
          <StageRail rail={card.rail} />
          <p className="text-muted flex flex-wrap justify-between gap-x-2 text-xs">
            <b className="text-foreground/80 truncate font-medium">
              {card.place.complete ? "Design complete" : (card.placeName ?? "Not started")}
            </b>
            {!card.place.complete && current ? (
              <span className="shrink-0">
                {current.label}
                {card.daysInStage !== null && card.currentStatus !== "done"
                  ? ` · ${card.daysInStage === 0 ? "since today" : `${card.daysInStage} day${card.daysInStage === 1 ? "" : "s"}`}`
                  : ""}
              </span>
            ) : null}
          </p>
        </div>

        {card.revising.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {card.revising.map((label) => (
              <Pill key={label} tone="danger" className="h-6 max-w-full px-2 text-[11px]">
                <span className="truncate">{label}</span>
              </Pill>
            ))}
          </div>
        ) : null}

        {card.next ? (
          <div className="border-border flex flex-col items-start gap-1.5 border-t pt-2 text-sm">
            <span className="text-foreground/80 line-clamp-2 min-w-0">{card.next.action}</span>
            {next ? (
              <Pill tone={DUE_TONE[next.tone]} className="h-6 max-w-full px-2 text-[11px]">
                <span className="truncate">{next.text}</span>
              </Pill>
            ) : null}
          </div>
        ) : null}

        <div className="text-muted mt-auto flex min-w-0 items-center gap-2 pt-0.5 text-xs">
          {card.people.length > 0 ? (
            <>
              <Faces names={card.people.map((person) => person.name)} />
              <span className="truncate">
                {card.people.length === 1
                  ? card.people[0].name.split(" ")[0]
                  : `${card.people.length} on it`}
              </span>
            </>
          ) : (
            <span>Nobody on it</span>
          )}
        </div>
      </Card>
    </Link>
  );
}
