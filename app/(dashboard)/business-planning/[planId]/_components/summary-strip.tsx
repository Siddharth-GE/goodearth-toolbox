"use client";

import { Card } from "@/components/ui/card";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { Select } from "@/components/ui/select";
import { SCENARIOS, type ScenarioIndex } from "@/lib/business-planning/inputs";
import type { ScenarioResult } from "@/lib/business-planning/model";
import { formatCrore, formatPercent, formatQuantity } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

/**
 * The answer, pinned above the tabs and recomputed on every keystroke.
 *
 * It is sticky because the whole value of the screen is watching these
 * move while you change an assumption three scrolls down. The scenario
 * picker lives here rather than in Setup for the same reason: flipping
 * Base to High is a thing you do while looking at the answer.
 *
 * Profit is deliberately much larger than everything else. This used to
 * be six equal figures at body-text size, which meant the screen never
 * said which number was the point of it — you had to read all six labels
 * to find the one you came for.
 */
export function SummaryStrip({
  result,
  activeScenario,
  onScenarioChange,
  saveState,
  velocityWarning,
}: {
  result: ScenarioResult;
  activeScenario: ScenarioIndex;
  onScenarioChange: (scenario: ScenarioIndex) => void;
  saveState: "idle" | "saving" | "saved" | "error";
  /** Some line has its three velocities out of ascending order. */
  velocityWarning: boolean;
}) {
  const profitable = result.pbt >= 0;
  const unsold = result.lines.reduce(
    (total, line) => total + (line.kind === "sale" ? line.unitsUnsold : 0),
    0,
  );

  return (
    <div className="bg-background sticky top-0 z-10 -mx-5 px-5 py-2 md:-mx-8 md:px-8">
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <Figure
              label="Profit before tax"
              value={formatCrore(result.pbt)}
              tone={profitable ? "good" : "bad"}
              size="hero"
            />
            <Figure label="Margin" value={formatPercent(result.marginPct)} size="lg" />
          </div>

          <div className="flex items-center gap-3">
            <SaveMarker state={saveState} />
            <label className="text-muted flex items-center gap-2 text-xs">
              <span className="sr-only sm:not-sr-only">Velocity</span>
              <Select
                aria-label="Scenario"
                value={String(activeScenario)}
                onChange={(event) => onScenarioChange(Number(event.target.value) as ScenarioIndex)}
                className="h-9 w-auto"
              >
                {SCENARIOS.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </div>

        {/* One band rather than four stretched cards: these are four views
            of the same plan, not four separate things. */}
        <FigureBand className="mt-4">
          <FigureBandCell>
            <Figure label="Revenue" value={formatCrore(result.revenue)} />
          </FigureBandCell>
          <FigureBandCell>
            {/* Two different questions, and the workbook conflated them.
                Peak funding is what you must raise; the trough is how
                close the balance came to the floor. */}
            <Figure
              label="Peak funding"
              value={formatCrore(result.peakFunding)}
              hint={result.peakFunding === 0 ? "equity covers it" : "to be raised"}
              tone={result.peakFunding === 0 ? "good" : "warn"}
            />
          </FigureBandCell>
          <FigureBandCell>
            <Figure
              label="Cash trough"
              value={formatCrore(result.cashTrough)}
              hint={result.cashTrough < 0 ? "goes negative" : "lowest balance"}
            />
          </FigureBandCell>
          <FigureBandCell>
            <Figure
              label="Return"
              value={result.irrAnnualPct === null ? "—" : formatPercent(result.irrAnnualPct)}
              hint={
                result.moneyMultiple === null
                  ? undefined
                  : `${result.moneyMultiple.toFixed(2)}× money`
              }
            />
          </FigureBandCell>
        </FigureBand>

        {unsold > 0.0001 ? (
          <Note>
            {result.name} leaves <strong>{formatQuantity(unsold)}</strong> unsold by the end of the
            plan. Their share of the land and infrastructure is charged; their revenue is not.
          </Note>
        ) : null}

        {velocityWarning ? (
          <Note>
            A line has its velocities out of order — Base is meant to be the slowest and High the
            fastest. Nothing has been changed; the columns just read backwards.
          </Note>
        ) : null}
      </Card>
    </div>
  );
}

/** A plain sentence about something that will mislead if left unsaid. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-warning/40 bg-warning/5 text-foreground mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs">
      <AlertTriangle className="text-warning mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function SaveMarker({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <span role="alert" className="text-danger text-xs font-medium">
        Not saved — check your connection
      </span>
    );
  }
  return (
    <span role="status" className="text-muted text-xs">
      {state === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}
