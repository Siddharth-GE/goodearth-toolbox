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
 * chooses colours and layers. The choices lean quiet on purpose: the
 * body is a gradient that fades to nothing rather than a flat tint, the
 * stage rules are dotted hairlines, and the only saturated ink on the
 * whole drawing is a marker that means trouble.
 *
 * THE INK GOES WHERE THE WORK IS. A villa with one trail used to be
 * drawn as a heavy line across the whole row — ninety percent of the
 * stroke saying "nothing here" at the same weight as the one hump that
 * mattered. The curve is now stroked only across the stages that hold
 * work (rising off the baseline and settling back beside them); the rest
 * of the row is just the ruled hairline. Two deliberate exceptions:
 * "complete" keeps its full-width green line, because the whole trail
 * having landed IS a statement about the whole row, and "nothing yet"
 * draws no curve at all — an absence should look absent.
 */
export function WaveSvg({ model, size = "sm" }: { model: WaveModel; size?: "sm" | "lg" }) {
  const W = 720;
  const H = size === "lg" ? 132 : 64;
  const PAD = size === "lg" ? 14 : 8;
  const baseline = H - PAD;

  // Complete is the only state that earns green: the work has landed.
  // Everything with open work is drawn in the reading colour, and the
  // dots — not the line — carry what is wrong. A line that changed colour
  // for every state would make five waves on a page into a rainbow, and
  // the eye would stop trusting any of them.
  const quiet = model.status === "quiet" || model.status === "waiting";
  const stroke =
    model.status === "complete" ? "var(--success)" : quiet ? "var(--muted)" : "var(--foreground)";
  const hasBody = model.points.some((p) => p.y > 0);

  // The living region: from the first stage holding work to the last.
  // The curve is built from only the points inside it, entering and
  // leaving on the baseline at its edges, so the stroke exists exactly
  // where the work does. The edges reach a little beyond the stages
  // themselves — a four-week stage is 4% of a three-year timeline, and
  // rising and falling inside that alone drew a needle, not a wave.
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

  // The curve starts and ends on the baseline, so Z closes it flat.
  const d = wavePath(strokePoints, W, H, PAD);
  const area = `${d} Z`;
  const drawCurve = model.status !== "quiet";

  // The body fades out instead of sitting as a flat tint — the curve is
  // the subject and the fill only gives it weight. Gradient ids repeat
  // across instances on one page; that is fine because every instance of
  // a variant defines the identical gradient.
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

      {/* Where one stage ends and the next begins — dotted hairlines,
          because the wave is the subject and these are only its ruled
          paper. */}
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

      {/* Where the plan says today is — one thin amber line, the same
          signal the schedule picture uses, so the two pictures agree.
          The head dot only on the big wave: on a card row it read as a
          stray orange lollipop, louder than the work itself. */}
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
 * The stage names for a wave, or a stack of waves sharing one x-axis.
 *
 * The names sit on TWO staggered rows, and that is not decoration.
 * Stage lengths vary wildly — Saarang runs a four-week Design straight
 * into a sixteen-week Technical Drawings — so one row either overlaps
 * the names or clips them to "De…" and "Co…". Staggering puts each
 * label's neighbours two stages away, which gives even a four-week stage
 * room for its full name over the exact point it labels.
 *
 * Always rendered INSIDE the surface that holds the wave, never floating
 * on the page: a strip of names hanging in page-space above a card reads
 * as debris, not as an axis.
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
        "text-muted relative hidden h-8 text-[10px] font-medium tracking-[0.12em] uppercase sm:block",
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
