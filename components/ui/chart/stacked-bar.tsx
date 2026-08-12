"use client";

/**
 * Part-to-whole. A stacked bar, never a pie — the deliberate exclusion
 * is written into the registry comments. A hairline of surface between
 * segments keeps adjacent colours from touching.
 */

import type { CartesianModel } from "@/lib/charts/series";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { HouseTooltip, axisProps, axisValue, gridProps } from "./chart-theme";

export function ChartStacked({ model }: { model: CartesianModel }) {
  const data = model.points.map((point) => ({ category: point.category, ...point.values }));
  const seriesLabels = Object.fromEntries(model.series.map((s) => [s.id, s.label]));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barCategoryGap="25%" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="category" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(value: number) => axisValue(value, model.money)} />
        <Tooltip
          cursor={{ fill: "var(--border)", opacity: 0.35 }}
          content={<HouseTooltip money={model.money} seriesLabels={seriesLabels} />}
        />
        {model.series.map((series) => (
          <Bar
            key={series.id}
            dataKey={series.id}
            stackId="stack"
            fill={series.color}
            stroke="var(--surface)"
            strokeWidth={1.5}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
