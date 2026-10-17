import type { WaveModel } from "@/lib/relay/wave";
import { wavePath } from "@/lib/relay/wave";
import { cn } from "@/lib/utils";

/**
 * A house's open work as one wave along the project's stages (inline SVG, scaled UNIFORMLY so dots don't smear).
 * It draws NO stage names: WaveStageHeader is the one way to label a wave. Arithmetic lives in lib/relay/wave.ts.
 * THE INK GOES WHERE THE WORK IS: stroke only stages holding work; "complete" is full-width green, "nothing yet" no curve.
 */
export function WaveSvg({ model, size = "sm" }: { model: WaveModel; size?: "sm" | "lg" }) {
  const W = 720;
  const H = size === "lg" ? 132 : 64;
  const PAD = size === "lg" ? 14 : 8;
  const baseline = H - PAD;

  // Only "complete" earns green; open work uses the reading colour and the dots carry what is wrong.
  const quiet = model.status === "quiet" || model.status === "waiting";
  const stroke =
    model.status === "complete" ? "var(--success)" : quiet ? "var(--muted)" : "var(--foreground)";
  const hasBody = model.points.some((p) => p.y > 0);

  // The living region: first to last stage holding work, padded so a short stage draws a wave, not a needle.
  const RAMP = 0.055;
  const active = model.bands.filter((b) => b.amp > 0);
  const lead = active.length > 0 ? Math.max(0, active[0].x0 - RAMP) : 0;
  const tail = active.length > 0 ? Math.min(1, active[active.length - 1].x1 + RAMP) : 1;
  const strokePoints =
    model.status === "complete" || active.length === 0
      ? model.points
      : [
          { x: lead, y: 0 },
          ...model.points.filter((p) => p.x > lead && p.x < tail),
          { x: tail, y: 0 },
        ];

  const d = wavePath(strokePoints, W, H, PAD);
  const area = `${d} Z`;
  const drawCurve = model.status !== "quiet";

  // The body fades out; gradient ids repeat across instances but each variant defines the same gradient.
  const fillId = quiet ? "relay-wave-body-quiet" : "relay-wave-body";
  const fillColour = quiet ? "var(--muted)" : "var(--accent)";

  const px = (x: number) => x * W;
  const py = (y: number) => baseline - Math.max(0, Math.min(1, y)) * (H - PAD * 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={fillColour} stopOpacity="0.16" />
          <stop offset="1" stopColor={fillColour} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {model.bands.slice(1).map((band) => (
        <line
          key={band.stageId}
          x1={px(band.x0)}
          y1={PAD + 2}
          x2={px(band.x0)}
          y2={baseline - 1}
          stroke="var(--border)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="1 5"
        />
      ))}

      <line x1="0" y1={baseline} x2={W} y2={baseline} stroke="var(--border)" strokeWidth="1" />

      {drawCurve && hasBody && <path d={area} fill={`url(#${fillId})`} stroke="none" />}

      {drawCurve && (
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Today's line matches the schedule picture; the head dot is only on the big wave (on a card row it looked like a lollipop). */}
      {model.planX !== null && (
        <g>
          <line
            x1={px(model.planX)}
            y1={PAD + 2}
            x2={px(model.planX)}
            y2={baseline}
            stroke="var(--warning)"
            strokeWidth="1.5"
            strokeOpacity={size === "lg" ? 0.75 : 0.5}
          />
          {size === "lg" && (
            <circle cx={px(model.planX)} cy={PAD + 2} r="2.5" fill="var(--warning)" />
          )}
        </g>
      )}

      {/* No animation on markers: a page of pulsing dots is an alarm to ignore. */}
      {model.markers.map((m) => (
        <g key={`${m.kind}-${m.x}`}>
          <circle
            cx={px(m.x)}
            cy={py(m.y)}
            r={size === "lg" ? 6 : 5}
            fill={m.kind === "stuck" ? "var(--danger)" : "var(--warning)"}
            stroke="var(--surface)"
            strokeWidth="2"
          />
          {m.count > 1 && (
            <text
              x={px(m.x)}
              y={py(m.y) - (size === "lg" ? 11 : 9)}
              textAnchor="middle"
              fontSize={size === "lg" ? 12 : 11}
              fontWeight="700"
              fill={m.kind === "stuck" ? "var(--danger)" : "var(--warning)"}
            >
              {m.count}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/**
 * Stage names for a wave or a stack sharing one x-axis, on TWO staggered rows so a four-week stage beside a sixteen-week one keeps its full name.
 * Render INSIDE the surface holding the wave, with no horizontal padding: labels are percentages of this element's width.
 */
export function WaveStageHeader({ wave, className }: { wave: WaveModel; className?: string }) {
  return (
    <div
      className={cn(
        "text-muted relative hidden h-8 text-[10px] font-medium tracking-[0.12em] uppercase sm:block",
        className,
      )}
    >
      {wave.bands.map((band, i) => {
        const mid = ((band.x0 + band.x1) / 2) * 100;
        // End names align to the edge, not their midpoint.
        const align = mid < 8 ? "0" : mid > 92 ? "-100%" : "-50%";
        return (
          <span
            key={band.stageId}
            className="absolute whitespace-nowrap"
            style={{
              left: `${mid}%`,
              top: i % 2 === 0 ? 0 : "1rem",
              transform: `translateX(${align})`,
            }}
          >
            {band.name}
          </span>
        );
      })}
    </div>
  );
}
