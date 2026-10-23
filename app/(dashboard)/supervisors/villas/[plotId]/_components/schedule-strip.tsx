import { formatMonthMark, formatShortDate } from "@/lib/format";
import { daysBetween } from "@/lib/supervisors/programme";
import type { StageView } from "@/lib/supervisors/programme-queries";
import { addDays } from "@/lib/supervisors/schedule";
import { cn } from "@/lib/utils";
import { ScrollToToday } from "./schedule-controls";

const DAY_PX = 6;
const ROW = "h-7";

/**
 * One bar per stage on a date strip, scrolling sideways on a phone: today marked, the first plan as a faint bar behind. Plain
 * boxes, not a chart — every position is days × a fixed width.
 */
export function ScheduleStrip({ stages, today }: { stages: StageView[]; today: string }) {
  const dates = stages.flatMap((stage) =>
    [
      stage.forecast.start,
      stage.forecast.finish,
      stage.plan.baselineStart,
      stage.plan.baselineFinish,
    ].filter((date): date is string => Boolean(date)),
  );
  if (dates.length === 0) return null;
  const first = [...dates, today].reduce((a, b) => (a < b ? a : b));
  const last = [...dates, today].reduce((a, b) => (a > b ? a : b));
  const from = addDays(first, -3);
  // Room after the last day for a "days not set" note.
  const to = addDays(last, 21);
  const span = daysBetween(from, to) + 1;
  const x = (date: string) => daysBetween(from, date) * DAY_PX;
  const width = span * DAY_PX;

  // A mark where the strip starts, then on each 1st.
  const months: string[] = [from];
  for (let month = `${addDays(from.slice(0, 8) + "28", 4).slice(0, 7)}-01`; month <= to;) {
    months.push(month);
    const [year, m] = month.split("-").map(Number);
    month = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`;
  }

  return (
    <ScrollToToday left={x(today)} className="overflow-x-auto overscroll-x-contain">
      <div className="relative" style={{ width: width + 80 }}>
        <div className="border-border flex border-b">
          <div className="bg-surface sticky left-0 z-10 w-20 shrink-0" />
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
          style={{ left: 80 + x(today) }}
        />
        <ul>
          {stages.map((stage) => {
            const { start, finish } = stage.forecast;
            const baseline =
              stage.plan.baselineStart && stage.plan.baselineFinish
                ? { start: stage.plan.baselineStart, finish: stage.plan.baselineFinish }
                : null;
            return (
              <li key={stage.id} className={cn("flex items-center", ROW)}>
                <span
                  className="bg-surface text-muted sticky left-0 z-10 w-20 shrink-0 truncate pr-2 font-mono text-[11px]"
                  title={`${stage.code} ${stage.name}`}
                >
                  {stage.code}
                </span>
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
                  {start && finish ? (
                    <span
                      title={`${stage.code} · ${formatShortDate(start)} – ${formatShortDate(finish)}`}
                      className={cn(
                        "absolute top-2 bottom-2 rounded-sm",
                        stage.status === "done" && "bg-accent",
                        stage.status === "working" && "bg-info",
                        stage.status === "waiting" && "bg-warning",
                        stage.status === "not_started" && "bg-foreground/35",
                      )}
                      style={{
                        left: x(start),
                        width: Math.max((daysBetween(start, finish) + 1) * DAY_PX, 3),
                      }}
                    />
                  ) : start ? (
                    <span
                      className="text-warning absolute top-0 text-[10px] leading-7 whitespace-nowrap"
                      style={{ left: x(start) }}
                    >
                      days not set
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </ScrollToToday>
  );
}
