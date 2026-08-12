"use client";

/**
 * Trend over time (or any ordered category): 2px lines, gaps where the
 * data is null (never a fabricated zero), crosshair + tooltip, markers
 * with hit targets larger than the marks.
 */

import type { CartesianModel } from "@/lib/charts/series";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { HouseTooltip, axisProps, axisValue, gridProps } from "./chart-theme";

export function ChartLines({ model }: { model: CartesianModel }) {
  const area = model.type === "area";
  const data = model.points.map((point) => ({ category: point.category, ...point.values }));
  const seriesLabels = Object.fromEntries(model.series.map((s) => [s.id, s.label]));

  const axes = (
    <>
      <CartesianGrid {...gridProps} />
      <XAxis dataKey="category" {...axisProps} />
      <YAxis {...axisProps} tickFormatter={(value: number) => axisValue(value, model.money)} />
      <Tooltip
        cursor={{ stroke: "var(--border)" }}
        content={<HouseTooltip money={model.money} seriesLabels={seriesLabels} />}
      />
    </>
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      {area ? (
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          {axes}
          {model.series.map((series) => (
            <Area
              key={series.id}
              dataKey={series.id}
              stroke={series.color}
              fill={series.color}
              fillOpacity={0.12}
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 3, fill: series.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          {axes}
          {model.series.map((series) => (
            <Line
              key={series.id}
              dataKey={series.id}
              stroke={series.color}
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 3, fill: series.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
