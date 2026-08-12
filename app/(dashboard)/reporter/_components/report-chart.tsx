"use client";

/**
 * The chart half of a report page. The model arrives fully shaped from
 * the server (lib/charts/series.ts — pure, tested); this component only
 * picks the wrapper. A "split" model renders side-by-side charts — two
 * measures on wildly different scales never share one axis.
 */

import { Card } from "@/components/ui/card";
import { ChartBars } from "@/components/ui/chart/bar-chart";
import { ChartCard } from "@/components/ui/chart/chart-card";
import { ChartLines } from "@/components/ui/chart/line-chart";
import { ChartMeter } from "@/components/ui/chart/meter";
import { ChartStacked } from "@/components/ui/chart/stacked-bar";
import type { CartesianModel, ChartModel } from "@/lib/charts/series";

function Cartesian({ model }: { model: CartesianModel }) {
  if (model.type === "stacked") return <ChartStacked model={model} />;
  if (model.type === "line" || model.type === "area") return <ChartLines model={model} />;
  return <ChartBars model={model} />;
}

export function ReportChart({ model }: { model: ChartModel }) {
  if (model.kind === "empty") {
    return (
      <Card className="p-4">
        <p className="text-muted text-sm">{model.reason}</p>
      </Card>
    );
  }

  if (model.kind === "meter") {
    return <ChartMeter model={model} />;
  }

  if (model.kind === "split") {
    return (
      <div className="space-y-2">
        <div className="grid gap-3 lg:grid-cols-2">
          {model.charts.map((chart) => (
            <ChartCard key={chart.series[0].id} title={chart.series[0].label}>
              <Cartesian model={chart} />
            </ChartCard>
          ))}
        </div>
        <p className="text-muted px-1 text-xs">{model.reason}</p>
      </div>
    );
  }

  return (
    <ChartCard series={model.series}>
      <Cartesian model={model} />
    </ChartCard>
  );
}
