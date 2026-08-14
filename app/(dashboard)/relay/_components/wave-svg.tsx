import type { WaveModel } from "@/lib/relay/wave";
import { wavePath } from "@/lib/relay/wave";
import { cn } from "@/lib/utils";

/**
 * A house's open work, drawn as one wave along the project's stages.
 *
 * Inline SVG for the same reason as the trail route: the shape IS the
 * information. Counts in a row would say how much work is open; only the
 * curve says where it is piled up and where nothing has started.
 *
 * Scaled UNIFORMLY — a stretched viewBox turns every marker dot into a
 * smear. On a phone the wave gets short; the status words beside it carry
 * the reading at that size, which is the same trade the trail route made.
 *
 * It draws NO stage names. It used to draw its own set at `lg`, centred
 * on each stage and clipped at the edges — which is the exact bug
 * `WaveStageHeader` below was written to fix, shipped twice because the
 * fix was applied to one copy and not the other. There is one way to
 * label a wave now, and it is that component.
 *
 * The model does all the arithmetic (lib/relay/wave.ts). This file only
 * chooses colours and layers.
 */
export function WaveSvg({ model, size = "sm" }: { model: WaveModel; size?: "sm" | "lg" }) {
  const W = 600;
  const H = size === "lg" ? 128 : 72;
  const PAD = size === "lg" ? 14 : 8;
  const baseline = H - PAD;
  const d = wavePath(model.points, W, H, PAD);
  const area = `${d} L ${W} ${baseline} L 0 ${baseline} Z`;

  // Complete is the only state that earns green: the work has landed.
  // Everything with open work is drawn in the reading colour, and the
  // dots — not the line — carry what is wrong. A line that changed colour
  // for every state would make five waves on a page into a rainbow, and
  // the eye would stop trusting any of them.
  const stroke =
    model.status === "complete"
      ? "var(--success)"
      : model.status === "quiet" || model.status === "waiting"
        ? "var(--muted)"
        : "var(--foreground)";
  const fill =
    model.status === "quiet" || model.status === "waiting" ? "var(--muted)" : "var(--accent)";
  const hasBody = model.points.some((p) => p.y > 0);

  const px = (x: number) => x * W;
  const py = (y: number) => baseline - Math.max(0, Math.min(1, y)) * (H - PAD * 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
      {/* Where one stage ends and the next begins — faint, because the
          wave is the subject and these are only its ruled lines. */}
      {model.bands.slice(1).map((band) => (
        <line
          key={band.stageId}
          x1={px(band.x0)}
          y1={PAD}
          x2={px(band.x0)}
          y2={baseline}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      ))}

      <line x1="0" y1={baseline} x2={W} y2={baseline} stroke="var(--border)" strokeWidth="1" />

      {hasBody && <path d={area} fill={fill} fillOpacity="0.1" stroke="none" />}

      <path d={d} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />

      {/* Where the plan says today is — the same marker the schedule
          picture uses, so the two pictures agree. */}
      {model.planX !== null && (
        <line
          x1={px(model.planX)}
          y1={PAD}
          x2={px(model.planX)}
          y2={baseline}
          stroke="var(--warning)"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
      )}

      {/* Trouble sits ON the curve, at the stage it belongs to. No
          animation: a page of pulsing dots is an alarm everyone learns to
          ignore, so breathing stays on the timer dial where there is
          something to press. */}
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
 * The stage names, written once above the stack instead of on every wave.
 *
 * Every villa shares one x-axis, so repeating eight stage names down the
 * page would be eight times the ink for the same fact. Hidden on a phone,
 * where they would be unreadable and the big wave on the house page is
 * the place to read stages anyway.
 *
 * The names sit on TWO staggered rows, and that is not decoration.
 * Stage lengths vary wildly — Saarang runs a four-week Design straight
 * into a sixteen-week Technical Drawings — so one row either overlaps
 * the names or clips them to "De…" and "Co…". Staggering puts each
 * label's neighbours two stages away, which gives even a four-week stage
 * room for its full name over the exact point it labels.
 *
 * Carries no horizontal padding of its own: the labels are positioned as
 * percentages of THIS element's width, so it has to be the exact width
 * of the wave it names. Padding it to match one caller's card would put
 * every label a few pixels off the stage it points at in the other.
 */
export function WaveStageHeader({ wave, className }: { wave: WaveModel; className?: string }) {
  return (
    <div
      className={cn(
        "text-muted relative hidden h-8 text-[11px] font-semibold tracking-widest uppercase sm:block",
        className,
      )}
    >
      {wave.bands.map((band, i) => {
        const mid = ((band.x0 + band.x1) / 2) * 100;
        // The first and last names would hang off the ends, so they line
        // up with the edge instead of their midpoint.
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
