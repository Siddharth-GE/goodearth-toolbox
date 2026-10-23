"use client";

import { formatMonthMark, formatShortDate } from "@/lib/format";
import { daysBetween, type StageStatus } from "@/lib/supervisors/programme";
import type { StageView } from "@/lib/supervisors/programme-queries";
import { addDays } from "@/lib/supervisors/schedule";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { stageFamilies } from "./stage-families";

const DAY_PX = 6;
const LABEL_PX = 112;

type Bar = { start: string; finish: string } | null;

const BAR_TONE: Record<StageStatus, string> = {
  done: "bg-accent",
  working: "bg-info",
  waiting: "bg-warning",
  not_started: "bg-foreground/35",
};

/** The stage most in hand tones a family's bar. */
function familyTone(stages: StageView[]): StageStatus {
  if (stages.some((stage) => stage.status === "waiting")) return "waiting";
  if (stages.some((stage) => stage.status === "working")) return "working";
  if (stages.every((stage) => stage.status === "done")) return "done";
  return stages.some((stage) => stage.status === "done") ? "working" : "not_started";
}

function span(bars: Bar[]): Bar {
  const real = bars.filter((bar): bar is NonNullable<Bar> => bar !== null);
  if (real.length === 0) return null;
  return {
    start: real.map((bar) => bar.start).reduce((a, b) => (a < b ? a : b)),
    finish: real.map((bar) => bar.finish).reduce((a, b) => (a > b ? a : b)),
  };
}

const forecastBar = (stage: StageView): Bar =>
  stage.forecast.start && stage.forecast.finish
    ? { start: stage.forecast.start, finish: stage.forecast.finish }
    : null;

const baselineBar = (stage: StageView): Bar =>
  stage.plan.baselineStart && stage.plan.baselineFinish
    ? { start: stage.plan.baselineStart, finish: stage.plan.baselineFinish }
    : null;

/**
 * The date strip: a bar per stage family, opened into its stages with a tap, today marked and the first plan as a faint bar
 * behind. A scroll bar above as well as below, kept in step, so a phone need not reach the bottom to move along. Plain boxes,
 * not a chart — every position is days × a fixed width.
 */
export function ScheduleStrip({ stages, today }: { stages: StageView[]; today: string }) {
  const families = stageFamilies(stages);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(families.filter((family) => family.inHand).map((family) => family.name)),
  );

  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const dates = stages.flatMap((stage) =>
    [forecastBar(stage), baselineBar(stage)].flatMap((bar) => (bar ? [bar.start, bar.finish] : [])),
  );
  const first = [...dates, today].reduce((a, b) => (a < b ? a : b));
  const last = [...dates, today].reduce((a, b) => (a > b ? a : b));
  const from = addDays(first, -3);
  // Room after the last day for a "days not set" note.
  const to = addDays(last, 21);
  const x = (date: string) => daysBetween(from, date) * DAY_PX;
  const width = (daysBetween(from, to) + 1) * DAY_PX;
  const todayX = x(today);

  useEffect(() => {
    const left = Math.max(todayX - 40, 0);
    if (body.current) body.current.scrollLeft = left;
    if (top.current) top.current.scrollLeft = left;
  }, [todayX]);

  if (dates.length === 0) return null;

  // Setting one bar's scroll fires its own scroll event; the flag stops that echo bouncing back.
  const follow = (source: HTMLDivElement | null, target: HTMLDivElement | null) => {
    if (!source || !target) return;
    if (syncing.current) {
      syncing.current = false;
      return;
    }
    if (target.scrollLeft === source.scrollLeft) return;
    syncing.current = true;
    target.scrollLeft = source.scrollLeft;
  };

  // A mark where the strip starts, then on each 1st.
  const months: string[] = [from];
  for (let month = `${addDays(from.slice(0, 8) + "28", 4).slice(0, 7)}-01`; month <= to;) {
    months.push(month);
    const [year, m] = month.split("-").map(Number);
    month = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`;
  }

  const toggle = (name: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const bars = (bar: Bar, baseline: Bar, tone: StageStatus, title: string, startOnly?: string) => (
    <span className="relative h-full" style={{ width }}>
      {baseline ? (
        <span
          className="bg-foreground/10 absolute top-1 bottom-1 rounded"
          style={{
            left: x(baseline.start),
            width: (daysBetween(baseline.start, baseline.finish) + 1) * DAY_PX,
          }}
        />
      ) : null}
      {bar ? (
        <span
          title={`${title} · ${formatShortDate(bar.start)} – ${formatShortDate(bar.finish)}`}
          className={cn("absolute top-2 bottom-2 rounded-sm", BAR_TONE[tone])}
          style={{
            left: x(bar.start),
            width: Math.max((daysBetween(bar.start, bar.finish) + 1) * DAY_PX, 3),
          }}
        />
      ) : startOnly ? (
        <span
          className="text-warning absolute top-0 text-[10px] leading-7 whitespace-nowrap"
          style={{ left: x(startOnly) }}
        >
          days not set
        </span>
      ) : null}
    </span>
  );

  return (
    <div className="space-y-1">
      <div
        ref={top}
        onScroll={() => follow(top.current, body.current)}
        className="overflow-x-auto overscroll-x-contain"
        aria-hidden="true"
      >
        <div className="h-px" style={{ width: width + LABEL_PX }} />
      </div>
      <div
        ref={body}
        onScroll={() => follow(body.current, top.current)}
        className="overflow-x-auto overscroll-x-contain"
      >
        <div className="relative" style={{ width: width + LABEL_PX }}>
          <div className="border-border flex border-b">
            <div className="bg-surface sticky left-0 z-10 shrink-0" style={{ width: LABEL_PX }} />
            <div className="relative h-6" style={{ width }}>
              {months.map((month) => (
                <span
                  key={month}
                  className="border-border text-muted absolute top-0 h-full border-l pl-1 text-[10px] leading-6"
                  style={{ left: x(month) }}
                >
                  {formatMonthMark(`${month}T00:00:00Z`)}
                </span>
              ))}
            </div>
          </div>
          <div
            aria-hidden="true"
            className="bg-accent absolute top-0 bottom-0 z-[5] w-px"
            style={{ left: LABEL_PX + todayX }}
          />
          <ul>
            {families.map((family) => {
              const expanded = open.has(family.name);
              return (
                <li key={family.name}>
                  <div className="flex h-8 items-center">
                    <button
                      type="button"
                      onClick={() => toggle(family.name)}
                      aria-expanded={expanded}
                      className="bg-surface text-foreground hover:text-accent sticky left-0 z-10 flex h-full shrink-0 items-center gap-1 pr-2 text-left text-xs font-medium"
                      style={{ width: LABEL_PX }}
                    >
                      <ChevronRight
                        className={cn(
                          "text-muted size-3.5 shrink-0 transition-transform",
                          expanded && "rotate-90",
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{family.name}</span>
                    </button>
                    {bars(
                      span(family.stages.map(forecastBar)),
                      span(family.stages.map(baselineBar)),
                      familyTone(family.stages),
                      family.name,
                    )}
                  </div>
                  {expanded ? (
                    <ul>
                      {family.stages.map((stage) => (
                        <li key={stage.id} className="flex h-7 items-center">
                          <span
                            className="bg-surface text-muted sticky left-0 z-10 shrink-0 truncate pr-2 pl-4.5 font-mono text-[11px]"
                            style={{ width: LABEL_PX }}
                            title={`${stage.code} ${stage.name}`}
                          >
                            {stage.code}
                          </span>
                          {bars(
                            forecastBar(stage),
                            baselineBar(stage),
                            stage.status,
                            stage.code,
                            stage.forecast.start ?? undefined,
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
