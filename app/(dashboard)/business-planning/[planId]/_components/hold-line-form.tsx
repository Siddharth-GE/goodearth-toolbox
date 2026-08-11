"use client";

import { Badge } from "@/components/ui/badge";
import { Figure, ResultPanel } from "@/components/ui/figure";
import { FieldRow, Section } from "@/components/ui/section";
import type { HoldLine } from "@/lib/business-planning/inputs";
import type { HoldLineResult } from "@/lib/business-planning/model";
import { formatCrore, formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import { MoneyField, MonthField, NumberField, PercentField, TextField } from "./fields";

/**
 * One HOLD line: something you build and keep earning from.
 *
 * Thirty-two fields, which is the most of any form in the toolbox, so how
 * they are grouped IS the design. They used to sit in seven identical
 * four-column blocks one after another — nine grids by the time the
 * results were counted — and the eye had nowhere to rest.
 *
 * Three sections open, two shut. What is open answers "what is this and
 * what does it earn"; what is shut is the cost build-up and the long-run
 * escalation assumptions, both set once when the line is created and
 * rarely opened again. Each closed section still reports its own total in
 * the header, so nothing is hidden — only folded.
 *
 * The area build-up stays first and deliberately explicit: the three
 * areas do three different jobs and mixing them up is the single most
 * expensive mistake available here — construction is costed on BUILT-UP
 * area, which at 50% efficiency is twice the carpet.
 */
export function HoldLineForm({
  line,
  result,
  onChange,
}: {
  line: HoldLine;
  result: HoldLineResult | undefined;
  onChange: (patch: Partial<HoldLine>) => void;
}) {
  const readyMonth = line.buildStartMonth + line.buildMonths;
  const stabilisedUnits = line.units * (line.occupancyPct / 100);

  return (
    <div className="space-y-3 pt-1">
      <TextField
        label="Name"
        value={line.name}
        placeholder="Senior living"
        onChange={(name) => onChange({ name })}
        className="max-w-sm"
      />

      <Section
        nested
        title="The site and what stands on it"
        note="Construction is costed on built-up area, not carpet."
        aside={
          result ? (
            <span className="text-muted font-mono text-xs">
              {formatQuantity(result.buaTotal)} sqft built-up
            </span>
          ) : null
        }
      >
        <FieldRow cols={3}>
          <NumberField
            label="Parcel area"
            value={line.landAreaSqft}
            onChange={(landAreaSqft) => onChange({ landAreaSqft })}
            suffix="sqft"
          />
          <NumberField
            label="Land cost"
            value={line.landCostPsf}
            onChange={(landCostPsf) => onChange({ landCostPsf })}
            suffix="₹/sqft"
            hint={`${formatCrore(line.landAreaSqft * line.landCostPsf)} · leave at zero if the site cost sits on another line`}
          />
          <NumberField
            label="Development"
            value={line.devCostPsf}
            onChange={(devCostPsf) => onChange({ devCostPsf })}
            suffix="₹/sqft"
            hint={`${formatCrore(line.landAreaSqft * line.devCostPsf)} · part of capex`}
          />
        </FieldRow>

        <FieldRow cols={5} className="mt-3">
          <NumberField
            label="Units"
            value={line.units}
            onChange={(units) => onChange({ units })}
            step="1"
          />
          <NumberField
            label="Carpet / unit"
            value={line.carpetSqftPerUnit}
            onChange={(carpetSqftPerUnit) => onChange({ carpetSqftPerUnit })}
            suffix="sqft"
            hint={result ? `${formatQuantity(result.carpetTotal)} sqft in all` : undefined}
          />
          <PercentField
            label="Efficiency"
            value={line.efficiencyPct}
            onChange={(efficiencyPct) => onChange({ efficiencyPct })}
            hint={
              result
                ? `built-up ${formatQuantity(result.buaTotal)} sqft — construction is costed on this`
                : "carpet ÷ built-up; lower means more walls"
            }
          />
          <PercentField
            label="Loading"
            value={line.loadingPct}
            onChange={(loadingPct) => onChange({ loadingPct })}
            hint={
              result
                ? `saleable ${formatQuantity(result.sbaTotal)} sqft — only used if sold`
                : "common area added on top of carpet"
            }
          />
          <NumberField
            label="Basement / parking"
            value={line.basementSqft}
            onChange={(basementSqft) => onChange({ basementSqft })}
            suffix="sqft"
          />
        </FieldRow>
      </Section>

      <Section
        nested
        title="What it costs to build"
        note="Rates and the percentages stacked on top of them. Set once, usually."
        collapsible
        defaultOpen={false}
        aside={
          result ? (
            <span className="text-foreground font-mono text-xs font-semibold">
              {formatCrore(result.capex)} capex
            </span>
          ) : null
        }
      >
        <FieldRow cols={3}>
          <NumberField
            label="Built-up construction"
            value={line.buaCostPsf}
            onChange={(buaCostPsf) => onChange({ buaCostPsf })}
            suffix="₹/sqft"
            hint={result ? formatCrore(result.buaTotal * line.buaCostPsf) : undefined}
          />
          <NumberField
            label="Basement construction"
            value={line.basementCostPsf}
            onChange={(basementCostPsf) => onChange({ basementCostPsf })}
            suffix="₹/sqft"
            hint={formatCrore(line.basementSqft * line.basementCostPsf)}
          />
          <MoneyField
            label="Amenities"
            value={line.amenitiesLumpsum}
            onChange={(amenitiesLumpsum) => onChange({ amenitiesLumpsum })}
            hint="clubhouse, landscaping — a lump sum"
          />
        </FieldRow>

        <FieldRow cols={3} className="mt-3">
          <PercentField
            label="MEP / services"
            value={line.mepPct}
            onChange={(mepPct) => onChange({ mepPct })}
            hint="of hard cost"
          />
          <PercentField
            label="Professional fees"
            value={line.professionalPct}
            onChange={(professionalPct) => onChange({ professionalPct })}
            hint="of hard cost + MEP"
          />
          <PercentField
            label="Contingency"
            value={line.contingencyPct}
            onChange={(contingencyPct) => onChange({ contingencyPct })}
            hint="of hard cost + MEP"
          />
        </FieldRow>
      </Section>

      <Section
        nested
        title="What it earns"
        note="When it opens, how fast it fills, and what a resident pays."
        aside={
          result ? (
            <span className="text-muted font-mono text-xs">
              {formatCrore(result.stabilisedNoi)} NOI a year
            </span>
          ) : null
        }
      >
        <FieldRow cols={4}>
          <MonthField
            label="Build starts"
            value={line.buildStartMonth}
            onChange={(buildStartMonth) => onChange({ buildStartMonth })}
          />
          <MonthField
            label="Build takes"
            value={line.buildMonths}
            onChange={(buildMonths) => onChange({ buildMonths })}
            hint={`ready in month ${readyMonth}`}
          />
          <NumberField
            label="Fills at"
            value={line.fillRatePerMonth}
            onChange={(fillRatePerMonth) => onChange({ fillRatePerMonth })}
            suffix="/mo"
            hint={
              line.fillRatePerMonth > 0 && stabilisedUnits > 0
                ? `full by month ${readyMonth + Math.ceil(stabilisedUnits / line.fillRatePerMonth) - 1}`
                : "never fills"
            }
          />
          <PercentField
            label="Occupancy"
            value={line.occupancyPct}
            onChange={(occupancyPct) => onChange({ occupancyPct })}
            hint={`${formatQuantity(stabilisedUnits)} of ${formatQuantity(line.units)} units at steady state`}
          />
        </FieldRow>

        <FieldRow cols={4} className="mt-3">
          <MoneyField
            label="Charge / occupied unit / month"
            value={line.chargePerUnitMonth}
            onChange={(chargePerUnitMonth) => onChange({ chargePerUnitMonth })}
          />
          <MoneyField
            label="Entry fee / unit"
            value={line.entryFeePerUnit}
            onChange={(entryFeePerUnit) => onChange({ entryFeePerUnit })}
            hint="once, on move-in"
          />
          <MoneyField
            label="Running cost / occupied unit / month"
            value={line.varOpexPerUnitMonth}
            onChange={(varOpexPerUnitMonth) => onChange({ varOpexPerUnitMonth })}
            hint="care, food, housekeeping, utilities"
          />
          <MoneyField
            label="Fixed cost / month"
            value={line.fixedOpexMonth}
            onChange={(fixedOpexMonth) => onChange({ fixedOpexMonth })}
            hint="whatever the occupancy"
          />
        </FieldRow>
      </Section>

      <Section
        nested
        title="Long-run assumptions"
        note="How long you hold it and what rises each year. These drive the hold-or-sell verdict, not the six-year plan."
        collapsible
        defaultOpen={false}
        aside={
          <span className="text-muted font-mono text-xs">
            {formatQuantity(line.holdYears)} yrs at {formatPercent(line.discountRatePct)}
          </span>
        }
      >
        <FieldRow cols={3}>
          <NumberField
            label="Hold for"
            value={line.holdYears}
            onChange={(holdYears) => onChange({ holdYears })}
            suffix="yrs"
            step="1"
            min={1}
            hint="exit at the end"
          />
          <PercentField
            label="Discount rate"
            value={line.discountRatePct}
            onChange={(discountRatePct) => onChange({ discountRatePct })}
            hint="your cost of capital"
          />
          <PercentField
            label="Resident turnover"
            value={line.turnoverPct}
            onChange={(turnoverPct) => onChange({ turnoverPct })}
            hint="a year — each replacement pays another entry fee"
          />
        </FieldRow>

        <FieldRow cols={3} className="mt-3">
          <PercentField
            label="Charges rise"
            value={line.chargeEscalationPct}
            onChange={(chargeEscalationPct) => onChange({ chargeEscalationPct })}
            hint="a year"
          />
          <PercentField
            label="Running costs rise"
            value={line.opexEscalationPct}
            onChange={(opexEscalationPct) => onChange({ opexEscalationPct })}
            hint="a year"
          />
          <PercentField
            label="Entry fees rise"
            value={line.entryEscalationPct}
            onChange={(entryEscalationPct) => onChange({ entryEscalationPct })}
            hint="a year"
          />
        </FieldRow>
      </Section>

      <Section
        nested
        title="Getting out"
        note="What it fetches at the end of the hold, against selling it outright instead."
      >
        <FieldRow cols={3}>
          <PercentField
            label="Exit cap rate"
            value={line.exitCapRatePct}
            onChange={(exitCapRatePct) => onChange({ exitCapRatePct })}
            hint="NOI ÷ this = what it sells for"
          />
          <NumberField
            label="Sale price"
            value={line.sellPricePsf}
            onChange={(sellPricePsf) => onChange({ sellPricePsf })}
            suffix="₹/sqft"
            hint="per sqft of saleable area"
          />
          <PercentField
            label="Selling cost"
            value={line.sellingCostPct}
            onChange={(sellingCostPct) => onChange({ sellingCostPct })}
            hint="of the sale value"
          />
        </FieldRow>
      </Section>

      {result ? <HoldOutcome result={result} /> : null}
    </div>
  );
}

/**
 * The verdict, and the figures behind it.
 *
 * On its own surface, not on the field grid, because everything here is
 * something the model worked out rather than something to type. Three
 * figures are large — what it costs, what it yields, what it returns —
 * because those are the ones a decision turns on.
 */
function HoldOutcome({ result }: { result: HoldLineResult }) {
  const holding = result.verdict === "hold";
  const gap = Math.abs(result.holdValue - result.sellValue);

  return (
    <ResultPanel
      title="What the model makes of it"
      aside={
        <div className="flex items-center gap-2">
          <Badge variant={holding ? "success" : "warning"}>{holding ? "Hold it" : "Sell it"}</Badge>
          <span className="text-muted text-xs">{formatCrore(gap)} better</span>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label="Capex" value={formatCrore(result.capex)} size="lg" />
        <Figure
          label="Yield on cost"
          value={formatPercent(result.yieldOnCostPct)}
          hint="stabilised NOI ÷ capex"
          size="lg"
        />
        <Figure
          label="Return, held"
          value={formatPercent(result.holdIrrPct)}
          hint="IRR on capex over the hold"
          size="lg"
        />
      </div>

      <div className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3 lg:grid-cols-5">
        <Figure
          label="Per unit"
          value={result.capexPerUnit === null ? "—" : formatMoney(result.capexPerUnit)}
          hint={
            result.capexPerBuaSqft === null
              ? undefined
              : `${formatMoney(result.capexPerBuaSqft)}/sqft built-up`
          }
        />
        <Figure label="Stabilised NOI" value={formatCrore(result.stabilisedNoi)} hint="a year" />
        {/* Two answers to "what is it worth", computed differently on
            purpose: this one is today's money at today's NOI, the next is
            year-N nominal discounted back. Labelled so the gap between
            them reads as the two questions it is, not as a discrepancy. */}
        <Figure
          label="Worth today"
          value={formatCrore(result.terminalValue)}
          hint="NOI ÷ cap rate, unescalated"
        />
        <Figure
          label="Value if held"
          value={formatCrore(result.holdValue)}
          hint="whole hold, discounted"
        />
        <Figure
          label="Value if sold"
          value={formatCrore(result.sellValue)}
          hint={`net of costs · ${result.equityMultiple === null ? "—" : `${result.equityMultiple.toFixed(2)}× money back`}`}
        />
      </div>
    </ResultPanel>
  );
}
