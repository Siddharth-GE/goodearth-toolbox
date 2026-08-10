"use client";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { PlanInputs } from "@/lib/business-planning/inputs";
import { SENSITIVITY_STEPS, sensitivityGrid } from "@/lib/business-planning/model";
import { formatCrore } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

/**
 * Twenty-five runs of the whole model: what you sell for against what it
 * costs to build.
 *
 * The workbook swings two named cells — the plotted house price and the
 * plotted construction cost — which cannot work once a plan has as many
 * lines as it likes. So both axes are proportional and move every line
 * at once, which is also the more honest question: prices do not fall on
 * villas and hold on row houses.
 *
 * Cells that turn a loss are marked, because the row where a plan stops
 * working is the only row anybody is really looking for.
 */
export function SensitivityGrid({ inputs }: { inputs: PlanInputs }) {
  const grid = useMemo(() => sensitivityGrid(inputs), [inputs]);
  const centre = grid[2][2].pbt;

  return (
    <Card className="p-4">
      <h2 className="text-foreground text-sm font-semibold">If things move</h2>
      <p className="text-muted text-xs">
        Profit before tax at the active velocity, with every price and every build cost swung
        together. The middle cell is this plan as it stands.
      </p>

      <div className="mt-3">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="whitespace-nowrap">
                Build cost ↓ / Prices →
              </TableHeaderCell>
              {SENSITIVITY_STEPS.map((step) => (
                <TableHeaderCell key={step} className="text-right font-mono">
                  {step > 0 ? `+${step}%` : `${step}%`}
                </TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {grid.map((row, rowIndex) => (
              <TableRow key={SENSITIVITY_STEPS[rowIndex]}>
                <TableCell className="text-muted font-mono whitespace-nowrap">
                  {SENSITIVITY_STEPS[rowIndex] > 0
                    ? `+${SENSITIVITY_STEPS[rowIndex]}%`
                    : `${SENSITIVITY_STEPS[rowIndex]}%`}
                </TableCell>
                {row.map((cell, columnIndex) => {
                  const isCentre = rowIndex === 2 && columnIndex === 2;
                  return (
                    <TableCell
                      key={cell.pricePct}
                      className={cn(
                        "text-right font-mono whitespace-nowrap",
                        cell.pbt < 0 && "text-danger",
                        isCentre && "text-foreground bg-accent/10 font-semibold",
                      )}
                    >
                      {formatCrore(cell.pbt)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted mt-3 text-xs">
        {grid.some((row) => row.some((cell) => cell.pbt < 0))
          ? "Cells in red lose money."
          : `This plan stays profitable across all of it — the worst corner is ${formatCrore(
              Math.min(...grid.flat().map((cell) => cell.pbt)),
            )} against ${formatCrore(centre)} today.`}
      </p>
    </Card>
  );
}
