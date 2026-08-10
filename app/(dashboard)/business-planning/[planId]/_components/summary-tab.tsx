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
import type { ScenarioIndex } from "@/lib/business-planning/inputs";
import type { PlanResult, ScenarioResult } from "@/lib/business-planning/model";
import { formatCrore, formatPercent, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * The collation: what each line contributes, what the project costs on
 * top, and what falls out — with Base, Moderate and High side by side
 * and the ACTIVE one marked.
 *
 * In crore throughout. Ten-digit rupee figures in three columns are
 * indistinguishable, and telling them apart is the entire job here.
 */
export function SummaryTab({
  result,
  activeScenario,
}: {
  result: PlanResult;
  activeScenario: ScenarioIndex;
}) {
  const active = result.active;

  if (active.lines.length === 0) {
    return <p className="text-muted text-sm">Add a line and the summary fills in.</p>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-foreground text-sm font-semibold">
          What each line contributes — {active.name}
        </h2>
        <p className="text-muted text-xs">
          Each line standing on its own, before the project&rsquo;s shared costs.
        </p>
        <div className="mt-3">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Line</TableHeaderCell>
                <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
                <TableHeaderCell className="text-right">Land</TableHeaderCell>
                <TableHeaderCell className="text-right">Built</TableHeaderCell>
                <TableHeaderCell className="text-right">Running</TableHeaderCell>
                <TableHeaderCell className="text-right">Gross profit</TableHeaderCell>
                <TableHeaderCell className="text-right">Margin</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {active.lines.map((line) => {
                const grossMarginPct =
                  line.revenue > 0 ? (line.grossProfit / line.revenue) * 100 : null;
                // The two kinds spend on different things — a SALE line
                // builds and infras, a HOLD line has capex and running
                // costs — so the columns are the shape they share and
                // the detail sits in the sub-line.
                const built =
                  line.kind === "sale" ? line.developmentCost + line.constructionCost : line.capex;
                const running = line.kind === "sale" ? 0 : line.operatingOpex;
                return (
                  <TableRow key={line.id}>
                    <TableCell className="text-foreground font-medium">
                      {line.name || "Untitled line"}
                      <div className="text-muted text-xs font-normal">
                        {line.kind === "sale" ? (
                          <>
                            {formatQuantity(line.unitsSold)} units sold
                            {line.unitsUnsold > 0.0001 ? (
                              <span className="text-warning">
                                {" "}
                                · {formatQuantity(line.unitsUnsold)} unsold
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <>
                            held · NOI {formatCrore(line.stabilisedNoi)}/yr ·{" "}
                            <span
                              className={line.verdict === "hold" ? "text-success" : "text-warning"}
                            >
                              {line.verdict === "hold" ? "hold it" : "sell it"}
                            </span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <Money value={line.revenue} />
                    <Money value={line.landCost} />
                    <Money value={built} />
                    <Money value={running} />
                    <Money value={line.grossProfit} strong />
                    <TableCell className="text-right font-mono">
                      {formatPercent(grossMarginPct)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-border border-t-2">
                <TableCell className="text-foreground font-semibold">All lines</TableCell>
                <Money value={active.revenue} strong />
                <Money value={active.landCost} strong />
                <Money value={active.developmentCost + active.constructionCost} strong />
                <Money value={active.operatingCost} strong />
                <Money
                  value={
                    active.revenue -
                    active.landCost -
                    active.developmentCost -
                    active.constructionCost -
                    active.operatingCost
                  }
                  strong
                />
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-foreground text-sm font-semibold">The whole plan</h2>
        <p className="text-muted text-xs">
          Three velocities over the same assumptions. The one in the strip above is marked.
        </p>
        <div className="mt-3">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell></TableHeaderCell>
                {result.scenarios.map((scenario) => (
                  <TableHeaderCell
                    key={scenario.name}
                    className={cn("text-right", scenario.index === activeScenario && "text-accent")}
                  >
                    {scenario.name}
                    {scenario.index === activeScenario ? " ●" : ""}
                  </TableHeaderCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              <ScenarioRow
                label="Revenue"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(s.revenue)}
              />
              <ScenarioRow
                label="Land"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(-s.landCost)}
              />
              <ScenarioRow
                label="Development & infra"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(-s.developmentCost)}
              />
              <ScenarioRow
                label="Construction"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(-s.constructionCost)}
              />
              <ScenarioRow
                label="Running held assets"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(-s.operatingCost)}
                hideWhenAllZero={(s) => s.operatingCost}
              />
              <ScenarioRow
                label="Overheads"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) =>
                  formatCrore(-(s.overheadsFixed + s.overheadsVariable + s.overheadsOneTime))
                }
              />
              <ScenarioRow
                label="Common infrastructure"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(-(s.commonInfraCapex + s.commonInfraOpex))}
              />
              <ScenarioRow
                label="Interest"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(-s.interest)}
              />
              <ScenarioRow
                label="Profit before tax"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(s.pbt)}
                strong
              />
              <ScenarioRow
                label="Margin"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatPercent(s.marginPct)}
              />
              {/* An asset you still own is not profit you can spend, so
                  it sits below PBT and is added in a row of its own. */}
              <ScenarioRow
                label="Value of what's held"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(s.terminalValue)}
                hideWhenAllZero={(s) => s.terminalValue}
              />
              <ScenarioRow
                label="PBT + held value"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(s.pbtWithHeldValue)}
                hideWhenAllZero={(s) => s.terminalValue}
              />
              <ScenarioRow
                label="Peak funding"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(s.peakFunding)}
              />
              <ScenarioRow
                label="Cash trough"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatCrore(s.cashTrough)}
              />
              <ScenarioRow
                label="Money multiple"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => (s.moneyMultiple === null ? "—" : `${s.moneyMultiple.toFixed(2)}×`)}
              />
              <ScenarioRow
                label="Return (annualised)"
                scenarios={result.scenarios}
                active={activeScenario}
                pick={(s) => formatPercent(s.irrAnnualPct)}
              />
            </TableBody>
          </Table>
        </div>
      </Card>

      <InterestNote result={active} />
    </div>
  );
}

/**
 * Why two interest figures exist and why they differ.
 *
 * This is stated on screen rather than left as a footnote, because the
 * two numbers WILL be compared and the gap is not an error — it is the
 * benefit of running the lines out of one account.
 */
function InterestNote({ result }: { result: ScenarioResult }) {
  if (result.standaloneInterest <= 0 && result.interest <= 0) return null;

  const saved = result.standaloneInterest - result.interest;

  return (
    <Card className="p-4">
      <h2 className="text-foreground text-sm font-semibold">Interest, pooled and separate</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Figure
          label="Each line alone"
          value={formatCrore(result.standaloneInterest)}
          hint="every line funding itself, with no equity"
        />
        <Figure
          label="Pooled"
          value={formatCrore(result.interest)}
          hint="one account, one revolver, the plan's equity behind it"
        />
        <Figure
          label="Difference"
          value={formatCrore(saved)}
          hint={
            saved > 0
              ? "what running them together saves"
              : "no saving — the lines don't offset each other"
          }
        />
      </div>
      <p className="text-muted mt-3 text-xs">
        These are not meant to add up. Pooled, a line in surplus funds a line in deficit, so the
        project borrows less than the parts would. The per-line figure is there to say whether a
        line carries itself.
      </p>
    </Card>
  );
}

function Money({
  value,
  strong,
  raw,
}: {
  value: number;
  strong?: boolean;
  /** A count, not money — units sold. */
  raw?: boolean;
}) {
  return (
    <TableCell
      className={cn(
        "text-right font-mono whitespace-nowrap",
        strong ? "text-foreground font-semibold" : undefined,
      )}
    >
      {raw ? formatQuantity(value) : formatCrore(value)}
    </TableCell>
  );
}

function ScenarioRow({
  label,
  scenarios,
  active,
  pick,
  strong,
  hideWhenAllZero,
}: {
  label: string;
  scenarios: readonly ScenarioResult[];
  active: ScenarioIndex;
  pick: (scenario: ScenarioResult) => string;
  strong?: boolean;
  /** Drop the row entirely when this is zero everywhere — a plan with no
      held lines shouldn't carry three empty rows about held value. */
  hideWhenAllZero?: (scenario: ScenarioResult) => number;
}) {
  if (hideWhenAllZero && scenarios.every((s) => Math.abs(hideWhenAllZero(s)) < 0.5)) return null;

  return (
    <TableRow className={strong ? "border-border border-t-2" : undefined}>
      <TableCell
        className={cn("whitespace-nowrap", strong ? "text-foreground font-semibold" : "text-muted")}
      >
        {label}
      </TableCell>
      {scenarios.map((scenario) => (
        <TableCell
          key={scenario.name}
          className={cn(
            "text-right font-mono whitespace-nowrap",
            strong && "font-semibold",
            scenario.index === active ? "text-foreground" : "text-muted",
          )}
        >
          {pick(scenario)}
        </TableCell>
      ))}
    </TableRow>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p className="text-foreground truncate font-mono text-sm font-semibold">{value}</p>
      {hint ? <p className="text-muted text-xs">{hint}</p> : null}
    </div>
  );
}
