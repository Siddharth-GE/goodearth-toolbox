"use client";

/**
 * One ratio against a limit — spend vs budget. A CSS bar, deliberately
 * not Recharts (PLAN.md: this was never chart-library work). The bar
 * clamps at 100%; the caption always tells the real percentage, and
 * turns warning past the limit — over budget has fixed meaning.
 */

import { Card } from "@/components/ui/card";
import { formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import type { MeterModel } from "@/lib/charts/series";
import { cn } from "@/lib/utils";

export function ChartMeter({ model }: { model: MeterModel }) {
  const format = (value: number | null) =>
    value === null ? "—" : model.money ? formatMoney(value) : formatQuantity(value);
  const over = (model.pct ?? 0) > 100;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            {model.valueLabel}
          </p>
          <p className="text-foreground font-mono text-xl font-bold tracking-tight tabular-nums">
            {format(model.value)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            {model.limitLabel}
          </p>
          <p className="text-foreground font-mono text-base font-semibold tabular-nums">
            {format(model.limit)}
          </p>
        </div>
      </div>

      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={model.barPct ?? undefined}
        aria-label={`${model.valueLabel} against ${model.limitLabel}`}
        className="border-border bg-background h-3 overflow-hidden rounded-full border"
      >
        <div
          className={cn("h-full rounded-full", over ? "bg-warning" : "bg-accent")}
          style={{ width: `${model.barPct ?? 0}%` }}
        />
      </div>

      <p className={cn("text-xs", over ? "text-warning font-medium" : "text-muted")}>
        {model.pct === null
          ? "No ratio yet — one side has no value."
          : `${formatPercent(model.pct)} of ${model.limitLabel.toLowerCase()}${over ? " — over the limit" : ""}`}
      </p>
    </Card>
  );
}
