import type { ScheduleSummary } from "@/lib/pusher/schedule";

/**
 * The project schedule as one picture: a track of stages sized by their
 * length in weeks, a dark bar showing how far the work has actually got,
 * and a marker showing where the plan says today is.
 *
 * The distance between the bar and the marker IS the slip. Everything
 * else on the overview is detail underneath that one comparison.
 *
 * Uniform scaling, like the trail route — a stretched viewBox turns
 * every marker into a smear.
 */
export function SchedulePath({ schedule }: { schedule: ScheduleSummary }) {
  if (!schedule.hasSchedule || schedule.stages.length === 0) return null;

  const W = 900;
  const H = 74;
  const TRACK_Y = 34;
  const TRACK_H = 14;
  const pxOf = (pct: number) => (Math.max(0, Math.min(100, pct)) / 100) * W;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
      {/* One block per stage, width proportional to its weeks. */}
      {schedule.stages.map((stage) => {
        const x = pxOf((stage.weekFrom / schedule.totalWeeks) * 100);
        const w = pxOf((stage.weeks / schedule.totalWeeks) * 100);
        return (
          <g key={stage.id}>
            <rect
              x={x + 1}
              y={TRACK_Y}
              width={Math.max(2, w - 2)}
              height={TRACK_H}
              rx="3"
              fill="var(--border)"
            />
            <text
              x={x + w / 2}
              y={TRACK_Y - 8}
              textAnchor="middle"
              fontSize="12"
              fontWeight={stage.id === schedule.currentStageId ? "700" : "500"}
              fill={stage.id === schedule.currentStageId ? "var(--warning)" : "var(--muted)"}
            >
              {stage.name}
            </text>
            <text
              x={x + w / 2}
              y={TRACK_Y + TRACK_H + 16}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted)"
            >
              {stage.weeks}w
            </text>
          </g>
        );
      })}

      {/* How far the work has actually got — the ground truth. */}
      <rect
        x="0"
        y={TRACK_Y}
        width={pxOf(schedule.actualPct)}
        height={TRACK_H}
        rx="3"
        fill="var(--foreground)"
      />

      {/* Where the plan says today is. The gap to the bar is the slip. */}
      <g>
        <line
          x1={pxOf(schedule.planPct)}
          y1={TRACK_Y - 4}
          x2={pxOf(schedule.planPct)}
          y2={TRACK_Y + TRACK_H + 4}
          stroke="var(--warning)"
          strokeWidth="2.5"
        />
        <circle cx={pxOf(schedule.planPct)} cy={TRACK_Y - 6} r="4" fill="var(--warning)" />
      </g>
    </svg>
  );
}
