import type { LegActual } from "@/lib/relay/chain";

/**
 * The trail drawn as a route: a node per leg, filled in behind the baton,
 * ringed in accent where it is standing now.
 *
 * Inline SVG, which is unprecedented in this codebase outside the logo —
 * justified here because the shape IS the information. A row of pills
 * would say the same words and none of the same thing.
 *
 * The viewBox is wide and scaled UNIFORMLY. The first version stretched
 * it with preserveAspectRatio="none" to fill any width, which turned
 * every node into a flat ellipse — the numbers inside them smeared out
 * sideways. Uniform scaling keeps circles circular; the cost is that the
 * strip gets short on a phone, which is the right trade because the leg
 * list underneath carries the same information in words.
 */
export function TrailRoute({ legs }: { legs: LegActual[] }) {
  const n = legs.length;
  if (n === 0) return null;

  const W = 900;
  const H = 60;
  const x = (i: number) => (n === 1 ? W / 2 : 40 + ((W - 80) * i) / (n - 1));
  // A gentle weave once there are enough legs to weave; a straight line
  // reads better than a pointless curve for one or two.
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
      viewBox={`0 0 ${W} ${H}`}
      className="mx-auto block h-auto w-full max-w-3xl"
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke="var(--border)" strokeWidth="4" strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="4"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${progress} 100`}
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
              r="13"
              fill={done ? "var(--foreground)" : "var(--surface)"}
              stroke={current ? "var(--accent)" : done ? "var(--foreground)" : "var(--border)"}
              strokeWidth={current ? 3 : 2}
            />
            <text
              x={p.x}
              y={p.y + 5}
              textAnchor="middle"
              fontSize="14"
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
