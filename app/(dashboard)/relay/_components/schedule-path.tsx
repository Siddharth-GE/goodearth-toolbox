import type { ScheduleSummary } from "@/lib/relay/schedule";

/**
 * The project schedule as one picture: a track of stages sized by their
 * length in weeks, each stage filled by its OWN progress, and a marker
 * showing where the plan says today is.
 *
 * Each stage fills in place, and that is the whole point. The first
 * version drew the weighted total (`actualPct`) as one bar from the left
 * edge — so finishing a Construction trail, which earns Construction's
 * large share of the weeks, painted straight over Design and Approvals
 * where nothing had happened. A bar from the left edge claims
 * "everything up to here is done"; only a per-stage fill can say
 * "Construction is moving and Design has not started".
 *
 * THE RULE THIS ESTABLISHED: a weighted total is a number, not a
 * position. Never draw one as a bar growing from the left.
 *
 * The slip still reads off the figures underneath and the verdict badge,
 * which say it in words.
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
      {/* One block per stage, width proportional to its weeks, filled by
          how much of that stage's own work is done. */}
      {schedule.stages.map((stage) => {
        const x = pxOf((stage.weekFrom / schedule.totalWeeks) * 100);
        const w = pxOf((stage.weeks / schedule.totalWeeks) * 100);
        const trackW = Math.max(2, w - 2);
        // A stage barely started still shows a sliver rather than
        // vanishing on a narrow block.
        const fillW = stage.progress > 0 ? Math.max(3, stage.progress * trackW) : 0;
        // Nothing filed under it at all is a different thing from filed
        // and not done, and it needs a different fix: file some trails,
        // not chase someone. A dashed outline says "nothing here yet";
        // a solid block says "work is waiting".
        const nothingFiled = stage.trailsTotal === 0;
        return (
          <g key={stage.id}>
            {nothingFiled ? (
              <rect
                x={x + 1.75}
                y={TRACK_Y + 0.75}
                width={Math.max(1, trackW - 1.5)}
                height={TRACK_H - 1.5}
                rx="3"
                fill="none"
                stroke="var(--border)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            ) : (
              <rect
                x={x + 1}
                y={TRACK_Y}
                width={trackW}
                height={TRACK_H}
                rx="3"
                fill="var(--border)"
              />
            )}
            {fillW > 0 && (
              <rect
                x={x + 1}
                y={TRACK_Y}
                width={Math.min(trackW, fillW)}
                height={TRACK_H}
                rx="3"
                fill="var(--foreground)"
              />
            )}
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

      {/* Where the plan says today is — drawn last so it sits above the
          fills rather than behind them. */}
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
