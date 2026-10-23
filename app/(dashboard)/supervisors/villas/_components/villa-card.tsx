import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { HealthPill } from "@/components/ui/health-pill";
import { SectionHead } from "@/components/ui/section-head";
import { StageRail, type RailFill } from "@/components/ui/stage-rail";
import { formatDate, formatShortDate } from "@/lib/format";
import type { BoardCard } from "@/lib/supervisors/board-queries";
import { HEALTH_TONE, STAGE_STATUS_LABEL, type StageStatus } from "@/lib/supervisors/programme";
import { describeSlip } from "@/lib/supervisors/schedule";
import { cn } from "@/lib/utils";
import Link from "next/link";

const RAIL_FILL: Record<StageStatus, RailFill> = {
  not_started: null,
  working: "working",
  waiting: "waiting",
  done: "done",
};

/** One villa on the board: where it stands, what is being worked and what comes next, and what is waiting on the supervisor. */
export function VillaCard({ card }: { card: BoardCard }) {
  return (
    <Link
      href={`/supervisors/villas/${card.plotId}`}
      className="focus-visible:ring-accent/25 block rounded-2xl focus-visible:ring-4 focus-visible:outline-none"
    >
      <Card interactive className="flex h-full min-w-0 flex-col gap-2.5 p-3.5">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0">
            <p className="text-muted text-[10px] font-medium tracking-[0.14em] uppercase">Plot</p>
            <p className="text-foreground font-mono text-2xl leading-none font-bold tracking-tight">
              {card.plotName}
            </p>
          </div>
          <span className="ml-auto">
            <HealthPill label={card.health.label} tone={HEALTH_TONE[card.health.kind]} />
          </span>
        </div>

        <div className="min-w-0">
          <p className="truncate text-[15px] leading-snug font-semibold tracking-tight">
            {card.villaName}
          </p>
          <p className="text-muted truncate text-xs">{card.projectName}</p>
        </div>

        {card.stages.length > 0 ? (
          <StageRail
            segments={card.stages.map((stage) => ({
              key: stage.id,
              label: `${stage.code} ${stage.name}`,
              status: STAGE_STATUS_LABEL[stage.status].toLowerCase(),
              fill: RAIL_FILL[stage.status],
              current: stage.status === "working" || stage.status === "waiting",
            }))}
          />
        ) : null}

        <div className="min-w-0 space-y-0.5 text-xs">
          {card.now ? (
            <p className="text-foreground/80 truncate">
              <span className="text-muted">Now </span>
              {`${card.now.label}${card.now.day ? ` · day ${card.now.day}` : ""}${card.nowMore ? ` · +${card.nowMore} more` : ""}`}
            </p>
          ) : null}
          {card.next ? (
            <p className="text-foreground/80 truncate">
              <span className="text-muted">Next </span>
              {`${card.next.label}${card.next.start ? ` · from ${formatShortDate(card.next.start)}` : ""}`}
            </p>
          ) : null}
          {card.handover ? (
            <p className="truncate">
              <span className="text-muted">{`Handover ${formatDate(card.handover)}`}</span>
              {card.slip ? (
                <span className={cn(card.slip > 0 ? "text-danger" : "text-muted")}>
                  {` · ${describeSlip(card.slip)}`}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="text-muted mt-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
          {card.supervisor ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Avatar name={card.supervisor.name} size={18} letters={2} />
              <span className="truncate">{card.supervisor.name.split(" ")[0]}</span>
            </span>
          ) : (
            <span>Nobody runs it yet</span>
          )}
          {card.toConfirm > 0 ? (
            <span className="text-info">{`${card.toConfirm} to confirm`}</span>
          ) : null}
          {card.openRequests > 0 ? (
            <span>{`${card.openRequests} ${card.openRequests === 1 ? "request" : "requests"} open`}</span>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

/** One column per stage family on a wide screen, scrolling sideways; stacked on a phone, each family a run of cards. */
export function BoardColumns({ columns, cards }: { columns: string[]; cards: BoardCard[] }) {
  const shown = columns.filter((column) => cards.some((card) => card.column === column));
  return (
    <div className="space-y-2 lg:grid lg:auto-cols-[minmax(15rem,1fr)] lg:grid-flow-col lg:gap-3 lg:space-y-0 lg:overflow-x-auto lg:pb-2">
      {shown.map((column) => {
        const here = cards.filter((card) => card.column === column);
        return (
          <section
            key={column}
            aria-label={column}
            className="lg:bg-foreground/[0.025] min-w-0 lg:rounded-2xl lg:p-2"
          >
            <SectionHead title={column} count={here.length} />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-3 lg:flex lg:flex-col lg:gap-2">
              {here.map((card) => (
                <VillaCard key={card.plotId} card={card} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
