"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Figure, ResultPanel } from "@/components/ui/figure";
import { FieldRow, Section } from "@/components/ui/section";
import { SCENARIOS, type PlanInputs, type SaleLine } from "@/lib/business-planning/inputs";
import type { SaleLineResult } from "@/lib/business-planning/model";
import { formatCrore, formatPercent, formatQuantity } from "@/lib/format";
import { AlertTriangle } from "lucide-react";
import { useId } from "react";
import { MonthField, NumberField, PercentField, TextField } from "./fields";

/**
 * One SALE line's inputs, grouped the way the founder described them:
 * land, then product and price, then when it sells, then how buyers pay.
 *
 * The zeros carry the product types. A bare-plot line has no built-up
 * area, so its construction row goes to zero on its own; an apartment
 * line has no saleable plot area and sells only built-up area. There is
 * no "type" to choose and no fields to hide.
 *
 * The three velocities sit together in a cluster of their own rather than
 * strung along a four-column row with an unrelated field on the end —
 * they are one decision expressed three ways, and they are the only input
 * in the whole tool that differs between scenarios.
 */
export function SaleLineForm({
  line,
  plan,
  result,
  otherLineCount,
  onChange,
}: {
  line: SaleLine;
  plan: PlanInputs;
  result: SaleLineResult | undefined;
  otherLineCount: number;
  onChange: (patch: Partial<SaleLine>) => void;
}) {
  const triggerId = useId();
  const overrideId = useId();

  const plotArea = line.units * line.plotSqftPerUnit;
  const revenuePerUnit =
    line.plotSqftPerUnit * line.landPricePsf + line.buaSqftPerUnit * line.housePricePsf;
  const costPerUnit =
    line.buaSqftPerUnit * line.constructionPsf +
    (line.units > 0 ? (line.landAreaSqft * (line.landCostPsf + line.devCostPsf)) / line.units : 0);
  const outOfOrder = line.velocity[1] < line.velocity[0] || line.velocity[2] < line.velocity[1];

  return (
    <div className="space-y-3 pt-1">
      <TextField
        label="Name"
        value={line.name}
        placeholder="Plotted villas"
        onChange={(name) => onChange({ name })}
        className="max-w-sm"
      />

      <Section nested title="The land" note="What the parcel costs before anything is built on it.">
        <FieldRow cols={3}>
          <NumberField
            label="Parcel area"
            value={line.landAreaSqft}
            onChange={(landAreaSqft) => onChange({ landAreaSqft })}
            suffix="sqft"
            hint={
              plotArea > 0
                ? `${formatQuantity(plotArea)} sqft of that is saleable plot`
                : "development cost is charged on this"
            }
          />
          <NumberField
            label="Land cost"
            value={line.landCostPsf}
            onChange={(landCostPsf) => onChange({ landCostPsf })}
            suffix="₹/sqft"
            hint={formatCrore(line.landAreaSqft * line.landCostPsf)}
          />
          <NumberField
            label="Development & infra"
            value={line.devCostPsf}
            onChange={(devCostPsf) => onChange({ devCostPsf })}
            suffix="₹/sqft"
            hint={formatCrore(line.landAreaSqft * line.devCostPsf)}
          />
        </FieldRow>
      </Section>

      <Section
        nested
        title="The product and its price"
        note="Leave an area at zero and its side of the sale disappears — bare plots have no built-up area, apartments have no saleable plot."
        aside={
          <span className="text-muted font-mono text-xs">
            {formatCrore(revenuePerUnit - costPerUnit)} a unit
          </span>
        }
      >
        <FieldRow cols={4}>
          <NumberField
            label="Units"
            value={line.units}
            onChange={(units) => onChange({ units })}
            step="1"
          />
          <NumberField
            label="Saleable plot / unit"
            value={line.plotSqftPerUnit}
            onChange={(plotSqftPerUnit) => onChange({ plotSqftPerUnit })}
            suffix="sqft"
            hint="zero for apartments"
          />
          <NumberField
            label="Built-up area / unit"
            value={line.buaSqftPerUnit}
            onChange={(buaSqftPerUnit) => onChange({ buaSqftPerUnit })}
            suffix="sqft"
            hint="zero for bare plots"
          />
          <MonthField
            label="Build cycle"
            value={line.buildMonths}
            onChange={(buildMonths) => onChange({ buildMonths })}
            hint="per unit, from the month it sells"
          />
        </FieldRow>

        <FieldRow cols={3} className="mt-3">
          <NumberField
            label="Land price"
            value={line.landPricePsf}
            onChange={(landPricePsf) => onChange({ landPricePsf })}
            suffix="₹/sqft"
            hint="per sqft of saleable plot"
          />
          <NumberField
            label="House price"
            value={line.housePricePsf}
            onChange={(housePricePsf) => onChange({ housePricePsf })}
            suffix="₹/sqft"
            hint="per sqft of built-up area"
          />
          <NumberField
            label="Construction cost"
            value={line.constructionPsf}
            onChange={(constructionPsf) => onChange({ constructionPsf })}
            suffix="₹/sqft"
            hint="per sqft of built-up area"
          />
        </FieldRow>

        <ResultPanel raised className="mt-3 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure label="Price / unit" value={formatCrore(revenuePerUnit)} />
            <Figure label="Cost / unit" value={formatCrore(costPerUnit)} />
            <Figure
              label="Margin / unit"
              value={formatCrore(revenuePerUnit - costPerUnit)}
              hint={
                revenuePerUnit > 0
                  ? formatPercent(((revenuePerUnit - costPerUnit) / revenuePerUnit) * 100)
                  : undefined
              }
              tone={revenuePerUnit - costPerUnit >= 0 ? undefined : "bad"}
            />
          </div>
        </ResultPanel>
      </Section>

      <Section
        nested
        title="When it sells"
        note="The one input that differs between Base, Moderate and High. Everything else is the same in all three."
      >
        <div className="border-border bg-surface rounded-xl border p-3">
          <FieldRow cols={3}>
            {SCENARIOS.map((name, index) => (
              <NumberField
                key={name}
                label={name}
                value={line.velocity[index]}
                onChange={(value) => {
                  const velocity: [number, number, number] = [...line.velocity];
                  velocity[index] = value;
                  onChange({ velocity });
                }}
                suffix="/mo"
                hint={
                  line.velocity[index] > 0 && line.units > 0
                    ? `sells out in ${Math.ceil(line.units / line.velocity[index])} months`
                    : "never sells"
                }
              />
            ))}
          </FieldRow>
          {outOfOrder ? (
            <p className="text-warning mt-2 flex items-start gap-1.5 text-xs">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                These read backwards — Base should be the slowest and High the fastest. Left exactly
                as typed.
              </span>
            </p>
          ) : null}
        </div>

        <FieldRow cols={3} className="mt-3">
          <MonthField
            label="First sale month"
            value={line.salesStartMonth}
            onChange={(salesStartMonth) => onChange({ salesStartMonth })}
          />
        </FieldRow>

        <div className="mt-3 space-y-2">
          <label htmlFor={triggerId} className="flex items-center gap-2 text-sm">
            <Checkbox
              id={triggerId}
              checked={line.launchTriggerPct !== null}
              onChange={(event) => onChange({ launchTriggerPct: event.target.checked ? 70 : null })}
            />
            <span>Hold this line back until the others have sold</span>
          </label>
          {line.launchTriggerPct !== null ? (
            <div className="pl-6">
              <FieldRow cols={3}>
                <PercentField
                  label="Release at"
                  value={line.launchTriggerPct}
                  onChange={(launchTriggerPct) => onChange({ launchTriggerPct })}
                  hint={
                    otherLineCount === 0
                      ? "nothing to wait for — this line launches anyway"
                      : `of every other line's units`
                  }
                />
              </FieldRow>
            </div>
          ) : null}
        </div>
      </Section>

      <Section
        nested
        title="How buyers pay"
        note="Only the timing of the money, not how much of it. The whole price is collected either way."
      >
        <label htmlFor={overrideId} className="flex items-center gap-2 text-sm">
          <Checkbox
            id={overrideId}
            checked={line.bookingPct !== null || line.instalments !== null}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? { bookingPct: plan.bookingPct, instalments: plan.instalments }
                  : { bookingPct: null, instalments: null },
              )
            }
          />
          <span>
            Different from the plan&rsquo;s {plan.bookingPct}% on booking over {plan.instalments}{" "}
            instalments
          </span>
        </label>
        {line.bookingPct !== null || line.instalments !== null ? (
          <div className="mt-2 pl-6">
            <FieldRow cols={3}>
              <PercentField
                label="Paid on booking"
                value={line.bookingPct ?? plan.bookingPct}
                onChange={(bookingPct) => onChange({ bookingPct })}
              />
              <NumberField
                label="Instalments"
                value={line.instalments ?? plan.instalments}
                onChange={(instalments) => onChange({ instalments })}
                step="1"
                min={1}
              />
            </FieldRow>
          </div>
        ) : null}
      </Section>

      {result ? <LineOutcome result={result} units={line.units} /> : null}
    </div>
  );
}

/**
 * What this line does on its own, at the ACTIVE velocity.
 *
 * The margin here is struck against the cost of what SOLD — the full
 * build of every home whose price was counted, plus the sold share of the
 * land — which is why it does not move when the velocity does. Unit
 * economics are a property of the product, not of how fast it goes.
 *
 * The interest is this line carrying itself with no equity behind it,
 * which is why it will not add up to the plan's consolidated figure:
 * pooled, a line in surplus funds a line in deficit. The Summary tab
 * shows both and names the gap.
 */
function LineOutcome({ result, units }: { result: SaleLineResult; units: number }) {
  const shortfall = result.unitsUnsold > 0.0001;

  return (
    <ResultPanel title="What this line does on its own">
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label="Revenue" value={formatCrore(result.revenue)} size="lg" />
        <Figure
          label="Gross profit"
          value={formatCrore(result.matchedProfit)}
          hint="on the cost of what sold"
          size="lg"
          tone={result.matchedProfit >= 0 ? undefined : "bad"}
        />
        <Figure label="Margin" value={formatPercent(result.marginPct)} size="lg" />
      </div>

      <div className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Units sold"
          value={`${formatQuantity(result.unitsSold)} of ${formatQuantity(units)}`}
          hint={shortfall ? `${formatQuantity(result.unitsUnsold)} left at the horizon` : undefined}
          tone={shortfall ? "warn" : undefined}
        />
        <Figure
          label="Cost of what sold"
          value={formatCrore(result.matchedCost)}
          hint="land share, infra share, full build"
        />
        <Figure
          label="Cash out by the horizon"
          value={formatCrore(result.directCost)}
          hint={
            Math.abs(result.matchedCost - result.directCost) > 1
              ? `${formatCrore(result.matchedCost - result.directCost)} of it falls later`
              : "all of it lands inside the plan"
          }
        />
        <Figure
          label="Interest, alone"
          value={formatCrore(result.interest)}
          hint="unfunded, on its own"
        />
      </div>
    </ResultPanel>
  );
}
