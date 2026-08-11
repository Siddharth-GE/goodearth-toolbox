"use client";

import { Figure } from "@/components/ui/figure";
import { Section } from "@/components/ui/section";
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
      <Section
        title={`What each line contributes — ${active.name}`}
        note="Each line standing on its own, before the project's shared costs. Costs are what the line spent on what it sold, so a held asset carries its whole build."
      >
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Line</TableHeaderCell>
              <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
              <TableHeaderCell className="text-right">Land</TableHeaderCell>
              <TableHeaderCell className="text-right">Built</TableHeaderCell>
              <TableHeaderCell className="text-right">Running</TableHeaderCell>
              <TableHeaderCell className="text-right">Gross profit</TableHeaderCell>
              {/* Not "Margin". A sale line reports a margin and a held
                  asset reports a yield, and putting the two under one
                  heading was how a −180% and a +22% came to sit in the
                  same column looking comparable. */}
              <TableHeaderCell className="text-right">Margin / yield</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {active.lines.map((line) => {
              // The two kinds spend on different things — a SALE line
              // builds and infras, a HOLD line has capex and running
              // costs — so the columns are the shape they share and
              // the detail sits in the sub-line.
              const built =
                line.kind === "sale"
                  ? line.developmentMatched + line.constructionMatched
                  : line.capex;
              const landShare = line.kind === "sale" ? line.landMatched : line.landCost;
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
                  <Money value={landShare} />
                  <Money value={built} />
                  <Money value={running} />
                  <Money value={line.matchedProfit} strong />
                  <TableCell className="text-right font-mono whitespace-nowrap">
                    {line.kind === "sale" ? (
                      formatPercent(line.marginPct)
                    ) : (
                      <>
                        {formatPercent(line.yieldOnCostPct)}
                        <span className="text-muted"> yield</span>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="border-border border-t-2">
              <TableCell className="text-foreground font-semibold">All lines</TableCell>
              <Money value={active.revenue} strong />
              <Money value={active.landMatched} strong />
              <Money value={active.developmentMatched + active.constructionMatched} strong />
              <Money value={active.operatingCost} strong />
              <Money
                value={
                  active.revenue -
                  active.landMatched -
                  active.developmentMatched -
                  active.constructionMatched -
                  active.operatingCost
                }
                strong
              />
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section
        title="The whole plan"
        note="Three sales velocities over the same assumptions — everything else is identical, and a held asset is the same in all three. The one in the strip above is marked."
      >
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
            {/* Costs here are what the plan spent on WHAT IT SOLD, not
                  what left the account before the horizon — those two
                  differ whenever a scenario fails to finish, and using
                  cash for both is what let a slower plan show a better
                  margin. The cash view lives on the Cashflow tab; the
                  "falls outside" row below names the gap. */}
            <ScenarioRow
              label="Land"
              scenarios={result.scenarios}
              active={activeScenario}
              pick={(s) => formatCrore(-s.landMatched)}
            />
            <ScenarioRow
              label="Development & infra"
              scenarios={result.scenarios}
              active={activeScenario}
              pick={(s) => formatCrore(-s.developmentMatched)}
            />
            <ScenarioRow
              label="Construction"
              scenarios={result.scenarios}
              active={activeScenario}
              pick={(s) => formatCrore(-s.constructionMatched)}
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
            {/* The reconciling row. Without it the cost lines above are
                  a different total from the cash on the Cashflow tab and
                  nothing on screen says why. */}
            <ScenarioRow
              label="of which falls outside the horizon"
              scenarios={result.scenarios}
              active={activeScenario}
              pick={(s) => formatCrore(s.costOutsideHorizon)}
              hideWhenAllZero={(s) => s.costOutsideHorizon}
              muted
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
            {/* Sold, owed, and not banked before the horizon ends. It is
                in the profit but not in the cash, so it makes the funding
                gap above look bigger than it is. */}
            <ScenarioRow
              label="of which still to collect"
              scenarios={result.scenarios}
              active={activeScenario}
              pick={(s) => formatCrore(s.receivableAtHorizon)}
              hideWhenAllZero={(s) => s.receivableAtHorizon}
              muted
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
      </Section>

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
    <Section
      title="Interest, pooled and separate"
      note="These are not meant to add up. Pooled, a line in surplus funds a line in deficit, so the project borrows less than the parts would. The per-line figure is there to say whether a line carries itself."
    >
      <div className="grid gap-3 sm:grid-cols-3">
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
    </Section>
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
  muted,
  hideWhenAllZero,
}: {
  label: string;
  scenarios: readonly ScenarioResult[];
  active: ScenarioIndex;
  pick: (scenario: ScenarioResult) => string;
  strong?: boolean;
  /** An aside rather than a figure in its own right — a "of which" row. */
  muted?: boolean;
  /** Drop the row entirely when this is zero everywhere — a plan with no
      held lines shouldn't carry three empty rows about held value. */
  hideWhenAllZero?: (scenario: ScenarioResult) => number;
}) {
  if (hideWhenAllZero && scenarios.every((s) => Math.abs(hideWhenAllZero(s)) < 0.5)) return null;

  return (
    <TableRow className={strong ? "border-border border-t-2" : undefined}>
      <TableCell
        className={cn(
          "whitespace-nowrap",
          strong ? "text-foreground font-semibold" : "text-muted",
          muted && "pl-8 text-xs italic",
        )}
      >
        {label}
      </TableCell>
      {scenarios.map((scenario) => (
        <TableCell
          key={scenario.name}
          className={cn(
            "text-right font-mono whitespace-nowrap",
            strong && "font-semibold",
            muted && "text-xs",
            scenario.index === active && !muted ? "text-foreground" : "text-muted",
          )}
        >
          {pick(scenario)}
        </TableCell>
      ))}
    </TableRow>
  );
}
