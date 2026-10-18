import type { ScheduleSummary } from "@/lib/relay/schedule";

/**
 * The schedule as a track of stages sized by weeks, each filled by its OWN progress, with today's marker.
 * THE RULE: a weighted total is a number, not a position. Never draw one as a bar growing from the left;
 * it paints over stages where nothing happened. Uniform scaling: a stretched viewBox smears markers.
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
      {schedule.stages.map((stage, i) => {
        const x = pxOf((stage.weekFrom / schedule.totalWeeks) * 100);
        const w = pxOf((stage.weeks / schedule.totalWeeks) * 100);
        const trackW = Math.max(2, w - 2);
        // A barely started stage still shows a sliver.
        const fillW = stage.progress > 0 ? Math.max(3, stage.progress * trackW) : 0;
        // Nothing filed is not "filed and not done" (the fix is filing trails, not chasing someone): dashed outline vs solid block.
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
            {/* End names align to the edge, not their midpoint, or they clip; names alternate onto two rows so short stages don't collide. */}
            <text
              x={x + w / 2}
              y={TRACK_Y - (i % 2 === 0 ? 22 : 8)}
              textAnchor={x + w / 2 < 60 ? "start" : x + w / 2 > W - 60 ? "end" : "middle"}
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

      {/* Today's marker is drawn last so it sits above the fills. */}
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
