"use client";

/**
 * Bars — vertical (`bar`) and horizontal (`hbar`, for long names or
 * many categories). Thin marks, 4px rounded data-ends anchored to the
 * baseline, a gap between adjacent bars, tooltip per mark.
 */

import type { CartesianModel } from "@/lib/charts/series";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { HouseTooltip, axisProps, axisValue, gridProps } from "./chart-theme";

export function ChartBars({ model }: { model: CartesianModel }) {
  const horizontal = model.type === "hbar";
  const data = model.points.map((point) => ({ category: point.category, ...point.values }));
  const seriesLabels = Object.fromEntries(model.series.map((s) => [s.id, s.label]));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        barCategoryGap="25%"
        barGap={2}
        margin={{ top: 4, right: 8, bottom: 0, left: horizontal ? 8 : 0 }}
      >
        <CartesianGrid {...gridProps} horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              {...axisProps}
              tickFormatter={(value: number) => axisValue(value, model.money)}
            />
            <YAxis type="category" dataKey="category" {...axisProps} width={120} />
          </>
        ) : (
          <>
            <XAxis type="category" dataKey="category" {...axisProps} />
            <YAxis
              type="number"
              {...axisProps}
              tickFormatter={(value: number) => axisValue(value, model.money)}
            />
          </>
        )}
        <Tooltip
          cursor={{ fill: "var(--border)", opacity: 0.35 }}
          content={<HouseTooltip money={model.money} seriesLabels={seriesLabels} />}
        />
        {model.series.map((series) => (
          <Bar
            key={series.id}
            dataKey={series.id}
            fill={series.color}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={40}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
