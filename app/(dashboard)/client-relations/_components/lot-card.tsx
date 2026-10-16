import { Card } from "@/components/ui/card";
import { HEALTH, PLOT_STATUS_LABELS, dueLabel, type Rail } from "@/lib/client-relations/next-steps";
import type { PlotCard } from "@/lib/client-relations/next-steps-queries";
import { KAADAL_STAGES, optionFor } from "@/lib/client-relations/stages";
import { cn } from "@/lib/utils";
import Link from "next/link";

import { Pill, PersonName } from "./pill";

/**
 * A plot as the tracker drew it — a surveyed lot: its number large and
 * monospaced, the buyer, a health pill, the five-step rail and the next
 * thing to do. The whole card opens the plot.
 */

const RAIL_STEPS = ["Buyer", "Sale deed", "Construction agreement", "Build", "Handed over"];

export function PlotRail({ rail, className }: { rail: Rail; className?: string }) {
  const description = RAIL_STEPS.map(
    (step, index) =>
      `${step}: ${index === 3 && rail.steps[3] && !rail.steps[4] ? `${Math.round(rail.build * 100)}%` : rail.steps[index] ? "done" : "not yet"}`,
  ).join(", ");
  return (
    <div role="img" aria-label={description} className={cn("grid grid-cols-5 gap-1", className)}>
      {rail.steps.map((on, index) => {
        const partial = index === 3 && on && !rail.steps[4];
        return (
          <span key={index} className="bg-foreground/[0.08] h-1.5 overflow-hidden rounded-full">
            {on ? (
              <span
                className="bg-accent block h-full rounded-full"
                style={{ width: partial ? `${Math.max(rail.build * 100, 12)}%` : "100%" }}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export function HealthPill({ health }: { health: PlotCard["health"] }) {
  if (!health) return null;
  const { label, tone } = HEALTH[health];
  return (
    <Pill tone={tone} className="h-6 gap-1 px-2 text-[11px]">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </Pill>
  );
}

export function LotCard({ card, today }: { card: PlotCard; today: string }) {
  const hasBuyer = Boolean(card.clientName);
  const next = card.next ? dueLabel({ ...card.next }, today) : null;
  const kaadal = optionFor(KAADAL_STAGES, card.kaadalStage);

  return (
    <Link
      href={`/client-relations/plots/${card.engagementId}`}
      className="focus-visible:ring-accent/25 block rounded-2xl focus-visible:ring-4 focus-visible:outline-none"
    >
      <Card interactive className="flex h-full min-w-0 flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <p className="text-muted text-[10px] font-medium tracking-[0.14em] uppercase">
              {card.unitType && !hasBuyer ? card.unitType : "Plot"}
            </p>
            <p className="text-foreground font-mono text-2xl leading-none font-bold tracking-tight">
              {card.number}
            </p>
          </div>
          <span className="ml-auto">
            {card.health ? (
              <HealthPill health={card.health} />
            ) : (
              <Pill className="h-6 px-2 text-[11px]">{PLOT_STATUS_LABELS[card.status]}</Pill>
            )}
          </span>
        </div>

        <p
          className={cn(
            "line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight",
            !hasBuyer && "text-muted font-medium",
          )}
        >
          {card.clientName ?? "No buyer yet"}
        </p>

        {hasBuyer ? (
          <div className="space-y-1.5">
            <PlotRail rail={card.rail} />
            <p className="text-muted flex justify-between gap-2 text-xs">
              <b className="text-foreground/80 truncate font-medium">
                {card.stageName ?? "Build not started"}
              </b>
              <span className="shrink-0">{PLOT_STATUS_LABELS[card.status]}</span>
            </p>
          </div>
        ) : null}

        {hasBuyer || card.next ? (
          <div className="border-border flex flex-col items-start gap-1.5 border-t pt-2.5 text-sm">
            {card.next ? (
              <>
                <span className="text-foreground/80 line-clamp-2 min-w-0">{card.next.action}</span>
                {next ? (
                  <Pill
                    tone={next.tone === "neutral" ? "plain" : next.tone}
                    className="h-6 max-w-full px-2 text-[11px]"
                  >
                    {next.text}
                  </Pill>
                ) : null}
              </>
            ) : (
              <span
                className={cn(
                  "flex-1",
                  card.health === "no_next_step" ? "text-warning" : "text-muted",
                )}
              >
                {card.health === "no_next_step" ? "No next step set" : "Nothing open"}
              </span>
            )}
          </div>
        ) : null}

        <div className="text-muted mt-auto flex min-w-0 items-center gap-2 text-xs">
          {card.ownerName ? (
            <PersonName name={card.ownerName} size={18} />
          ) : (
            <span>Unassigned</span>
          )}
          {kaadal ? (
            <Pill tone="info" className="ml-auto h-6 truncate px-2 text-[11px]">
              {kaadal.label}
            </Pill>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}
