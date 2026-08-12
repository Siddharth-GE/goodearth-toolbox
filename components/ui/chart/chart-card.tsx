"use client";

/**
 * The card a chart sits in: Card on surface, recessive chrome, a
 * custom legend when two or more series share the plot — identity is
 * never carried by colour alone, so the legend always names them.
 */

import { Card } from "@/components/ui/card";
import type { ChartSeries } from "@/lib/charts/series";
import type { ReactNode } from "react";

import { CHART_HEIGHT } from "./chart-theme";

export function ChartCard({
  title,
  series,
  note,
  children,
}: {
  title?: string;
  /** Legend entries; rendered when there are two or more. */
  series?: ChartSeries[];
  /** A quiet sentence under the chart (e.g. why it was split). */
  note?: string;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-3 p-4">
      {(title || (series && series.length >= 2)) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title ? (
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">{title}</p>
          ) : (
            <span />
          )}
          {series && series.length >= 2 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {series.map((entry) => (
                <span key={entry.id} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: entry.color }}
                  />
                  <span className="text-muted text-xs">{entry.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <div className={CHART_HEIGHT}>{children}</div>
      {note && <p className="text-muted text-xs">{note}</p>}
    </Card>
  );
}
