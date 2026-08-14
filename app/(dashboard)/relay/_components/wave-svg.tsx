import type { WaveModel } from "@/lib/relay/wave";
import { wavePath } from "@/lib/relay/wave";

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
 * The model does all the arithmetic (lib/relay/wave.ts). This file only
 * chooses colours and layers.
 */
export function WaveSvg({ model, size = "sm" }: { model: WaveModel; size?: "sm" | "lg" }) {
  const W = 600;
  const H = size === "lg" ? 150 : 72;
  const PAD = size === "lg" ? 14 : 8;
  const LABELS = size === "lg" ? 22 : 0;
  // The curve is drawn in the box above the stage labels, so the labels
  // never sit under the wave.
  const baseline = H - LABELS - PAD;
  const d = wavePath(model.points, W, H - LABELS, PAD);
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
  const py = (y: number) => baseline - Math.max(0, Math.min(1, y)) * (H - LABELS - PAD * 2);

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

      {/* Stage names only on the big wave. On a card they would be four
          pixels tall and the status words already say it. */}
      {size === "lg" &&
        model.bands.map((band) => (
          <text
            key={band.stageId}
            x={px((band.x0 + band.x1) / 2)}
            y={H - 6}
            textAnchor="middle"
            fontSize="11"
            fontWeight="500"
            fill="var(--muted)"
          >
            {band.name}
          </text>
        ))}
    </svg>
  );
}
