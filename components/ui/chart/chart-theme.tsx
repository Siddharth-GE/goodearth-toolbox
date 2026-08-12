"use client";

/**
 * The house style every chart passes to Recharts — hairline grid in
 * --border, --muted axis labels, tooltip on surface-raised — so no
 * screen ever hands Recharts raw styling props. Colours are CSS
 * variable TOKENS throughout: Recharts passes them straight through to
 * SVG attributes, which resolve them in the DOM, so light/dark swap in
 * app/globals.css and DESIGN.md's no-hex rule holds.
 */

import { formatCrore, formatMoney, formatQuantity } from "@/lib/format";

export const CHART_HEIGHT = "h-64 sm:h-72";

export const axisTick = { fill: "var(--muted)", fontSize: 11 } as const;

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: axisTick,
} as const;

export const gridProps = {
  stroke: "var(--border)",
  vertical: false,
} as const;

/** Exact in the tooltip, compact on the axis. */
export function tooltipValue(value: number | null, money: boolean): string {
  if (value === null) return "—";
  return money ? formatMoney(value) : formatQuantity(value);
}

export function axisValue(value: number, money: boolean): string {
  return money ? formatCrore(value) : formatQuantity(value);
}

type TooltipEntry = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
};

/**
 * The one tooltip. Recharts hands `payload` per hovered category; the
 * label map turns series ids into the words on screen.
 */
export function HouseTooltip({
  active,
  payload,
  label,
  money,
  seriesLabels,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  money: boolean;
  seriesLabels: Record<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="border-border bg-surface-raised rounded-xl border px-3 py-2 shadow-sm">
      <p className="text-foreground text-xs font-semibold">{String(label ?? "")}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-muted text-xs">
              {seriesLabels[String(entry.dataKey)] ?? String(entry.name ?? "")}
            </span>
            <span className="text-foreground ml-auto pl-3 font-mono text-xs tabular-nums">
              {tooltipValue(typeof entry.value === "number" ? entry.value : null, money)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
