"use client";

import { Select } from "@/components/ui/select";
import { SCENARIOS, type ScenarioIndex } from "@/lib/business-planning/inputs";
import type { ScenarioResult } from "@/lib/business-planning/model";
import { formatCrore, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The six figures the founder is actually asking the tool for, pinned
 * above the tabs and recomputed on every keystroke.
 *
 * It is sticky because the whole value of the screen is watching these
 * move while you change an assumption three scrolls down. The scenario
 * picker lives here rather than in Setup for the same reason: flipping
 * Base to High is a thing you do while looking at the answer.
 */
export function SummaryStrip({
  result,
  activeScenario,
  onScenarioChange,
  saveState,
}: {
  result: ScenarioResult;
  activeScenario: ScenarioIndex;
  onScenarioChange: (scenario: ScenarioIndex) => void;
  saveState: "idle" | "saving" | "saved" | "error";
}) {
  const profitable = result.pbt >= 0;

  return (
    <div className="bg-background sticky top-0 z-10 -mx-5 px-5 py-2">
      <div className="border-border bg-surface rounded-2xl border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
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
            <span className="text-muted text-xs">velocity</span>
          </div>
          <SaveMarker state={saveState} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Figure
            label="Profit before tax"
            value={formatCrore(result.pbt)}
            tone={profitable ? "good" : "bad"}
          />
          <Figure label="Margin" value={formatPercent(result.marginPct)} />
          <Figure label="Revenue" value={formatCrore(result.revenue)} />
          {/* Two different questions, and the workbook conflated them.
              Peak funding is what you must raise; the trough is how
              close the balance came to the floor. */}
          <Figure
            label="Peak funding"
            value={formatCrore(result.peakFunding)}
            hint={result.peakFunding === 0 ? "equity covers it" : "to be raised"}
            tone={result.peakFunding === 0 ? "good" : "warn"}
          />
          <Figure
            label="Cash trough"
            value={formatCrore(result.cashTrough)}
            hint={result.cashTrough < 0 ? "goes negative" : "lowest balance"}
          />
          <Figure
            label="Return"
            value={result.irrAnnualPct === null ? "—" : formatPercent(result.irrAnnualPct)}
            hint={
              result.moneyMultiple === null
                ? undefined
                : `${result.moneyMultiple.toFixed(2)}× money`
            }
          />
        </div>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p
        className={cn(
          "truncate font-mono text-sm font-semibold",
          tone === "good" && "text-success",
          tone === "warn" && "text-warning",
          tone === "bad" && "text-danger",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-muted truncate text-xs">{hint}</p> : null}
    </div>
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
