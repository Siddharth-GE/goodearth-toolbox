import type { LegActual } from "@/lib/pusher/chain";

/**
 * The trail drawn as a route: a node per leg, filled behind the baton,
 * ringed in accent where it is standing now.
 *
 * Inline SVG, which is unprecedented in this codebase outside the logo —
 * justified here because the shape IS the information. A row of pills
 * would say the same words and none of the same thing.
 *
 * viewBox is a fixed 100-wide coordinate space with
 * preserveAspectRatio="none", so it stretches to any container width
 * while the stroke weights stay readable.
 */
export function TrailRoute({ legs }: { legs: LegActual[] }) {
  const n = legs.length;
  if (n === 0) return null;

  const H = 26;
  const x = (i: number) => (n === 1 ? 50 : 8 + (84 * i) / (n - 1));
  // A gentle weave for longer trails; a straight line reads better for
  // one or two legs than a pointless curve.
  const y = (i: number) => (n <= 2 ? H / 2 : i % 2 ? H * 0.68 : H * 0.32);

  const points = legs.map((_, i) => ({ x: x(i), y: y(i) }));
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const mid = (a.x + b.x) / 2;
    d += ` C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
  }

  const doneCount = legs.filter((l) => l.status === "done").length;
  const progress = n === 1 ? (doneCount ? 100 : 0) : Math.min(100, (doneCount / (n - 1)) * 100);

  return (
    <svg
      viewBox={`0 0 100 ${H}`}
      preserveAspectRatio="none"
      className="block h-16 w-full"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--border)"
        strokeWidth="2.4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="2.4"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${progress} 100`}
        vectorEffect="non-scaling-stroke"
      />
      {points.map((p, i) => {
        const leg = legs[i];
        const done = leg.status === "done";
        const current = leg.status === "current";
        return (
          <g key={leg.legNo}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill={done ? "var(--foreground)" : "var(--surface)"}
              stroke={current ? "var(--accent)" : done ? "var(--foreground)" : "var(--border)"}
              strokeWidth={current ? 1.6 : 1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={p.x}
              y={p.y + 1.5}
              textAnchor="middle"
              fontSize="4.5"
              fontWeight="600"
              fill={done ? "var(--surface)" : current ? "var(--accent)" : "var(--muted)"}
            >
              {done ? "✓" : leg.legNo}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
