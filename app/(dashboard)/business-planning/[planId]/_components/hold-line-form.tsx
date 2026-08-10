"use client";

import { Badge } from "@/components/ui/badge";
import type { HoldLine } from "@/lib/business-planning/inputs";
import type { HoldLineResult } from "@/lib/business-planning/model";
import { formatCrore, formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import {
  MoneyField,
  MonthField,
  NumberField,
  PercentField,
  SectionLabel,
  TextField,
} from "./fields";

/**
 * One HOLD line: something you build and keep earning from.
 *
 * The area build-up is first and deliberately explicit, because the
 * three areas do three different jobs and mixing them up is the single
 * most expensive mistake available here — construction is costed on
 * BUILT-UP area, which at 50% efficiency is twice the carpet.
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
    <div className="space-y-4 pt-1">
      <TextField
        label="Name"
        value={line.name}
        placeholder="Senior living"
        onChange={(name) => onChange({ name })}
        className="max-w-sm"
      />

      <div>
        <SectionLabel>Land</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </div>

      <div>
        <SectionLabel>Area build-up</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </div>

      <div>
        <SectionLabel>Build cost</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </div>

      <div>
        <SectionLabel>Building and filling</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </div>

      <div>
        <SectionLabel>What it earns and costs to run</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </div>

      <div>
        <SectionLabel>Holding it, long term</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            label="Exit cap rate"
            value={line.exitCapRatePct}
            onChange={(exitCapRatePct) => onChange({ exitCapRatePct })}
            hint="NOI ÷ this = what it sells for"
          />
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
          <PercentField
            label="Resident turnover"
            value={line.turnoverPct}
            onChange={(turnoverPct) => onChange({ turnoverPct })}
            hint="a year — each replacement pays another entry fee"
          />
        </div>
      </div>

      <div>
        <SectionLabel>Or sell it instead</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </div>

      {result ? <HoldOutcome result={result} /> : null}
    </div>
  );
}

/** The verdict, and the figures behind it. */
function HoldOutcome({ result }: { result: HoldLineResult }) {
  const holding = result.verdict === "hold";
  const gap = Math.abs(result.holdValue - result.sellValue);

  return (
    <div className="border-border bg-background space-y-3 rounded-xl border p-3">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Figure label="Capex" value={formatCrore(result.capex)} />
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
        <Figure label="Yield on cost" value={formatPercent(result.yieldOnCostPct)} />
        <Figure
          label="Worth, held"
          value={formatCrore(result.terminalValue)}
          hint="NOI ÷ cap rate"
        />
      </div>

      <div className="border-border grid gap-3 border-t pt-3 sm:grid-cols-3 lg:grid-cols-5">
        <Figure label="Value if held" value={formatCrore(result.holdValue)} hint="discounted" />
        <Figure label="Value if sold" value={formatCrore(result.sellValue)} hint="net of costs" />
        <div className="min-w-0">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Verdict</p>
          <Badge variant={holding ? "success" : "warning"} className="mt-1">
            {holding ? "Hold it" : "Sell it"}
          </Badge>
          <p className="text-muted mt-1 text-xs">{formatCrore(gap)} better</p>
        </div>
        <Figure label="Return, held" value={formatPercent(result.holdIrrPct)} hint="on capex" />
        <Figure
          label="Money back"
          value={result.equityMultiple === null ? "—" : `${result.equityMultiple.toFixed(2)}×`}
          hint="undiscounted, over the hold"
        />
      </div>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p className="text-foreground truncate font-mono text-sm font-semibold">{value}</p>
      {hint ? <p className="text-muted truncate text-xs">{hint}</p> : null}
    </div>
  );
}
