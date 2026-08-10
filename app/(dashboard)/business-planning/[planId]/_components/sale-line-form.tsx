"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { SCENARIOS, type PlanInputs, type SaleLine } from "@/lib/business-planning/inputs";
import type { SaleLineResult } from "@/lib/business-planning/model";
import { formatCrore, formatQuantity } from "@/lib/format";
import { useId } from "react";
import { MonthField, NumberField, PercentField, SectionLabel, TextField } from "./fields";

/**
 * One SALE line's inputs, grouped the way the founder described them:
 * land, then product, then prices, then when it sells.
 *
 * The zeros carry the product types. A bare-plot line has no built-up
 * area, so its construction row goes to zero on its own; an apartment
 * line has no saleable plot area and sells only built-up area. There is
 * no "type" to choose and no fields to hide.
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

  return (
    <div className="space-y-4 pt-1">
      <TextField
        label="Name"
        value={line.name}
        placeholder="Plotted villas"
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
        </div>
      </div>

      <div>
        <SectionLabel>Product</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </div>

      <div>
        <SectionLabel>Prices and build cost</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="min-w-0">
            <p className="text-muted text-xs font-medium">Per unit</p>
            <p className="text-foreground mt-1 font-mono text-sm font-semibold">
              {formatCrore(revenuePerUnit - costPerUnit)}
            </p>
            <p className="text-muted text-xs">
              {formatCrore(revenuePerUnit)} in, {formatCrore(costPerUnit)} out
            </p>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>When it sells</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SCENARIOS.map((name, index) => (
            <NumberField
              key={name}
              label={`${name} velocity`}
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
          <MonthField
            label="First sale month"
            value={line.salesStartMonth}
            onChange={(salesStartMonth) => onChange({ salesStartMonth })}
          />
        </div>

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
            <div className="grid gap-3 pl-6 sm:grid-cols-2 lg:grid-cols-4">
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
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <SectionLabel>How buyers pay</SectionLabel>
        <label htmlFor={overrideId} className="mt-2 flex items-center gap-2 text-sm">
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
          <div className="mt-2 grid gap-3 pl-6 sm:grid-cols-2 lg:grid-cols-4">
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
          </div>
        ) : null}
      </div>

      {result ? <LineOutcome result={result} units={line.units} /> : null}
    </div>
  );
}

/**
 * What this line does on its own, at the ACTIVE velocity.
 *
 * The interest here is the line carrying itself with no equity behind
 * it, which is why it will not add up to the plan's consolidated figure
 * — pooled, a line in surplus funds a line in deficit. The Summary tab
 * shows both and names the gap.
 */
function LineOutcome({ result, units }: { result: SaleLineResult; units: number }) {
  const shortfall = result.unitsUnsold > 0.0001;

  return (
    <div className="border-border bg-background rounded-xl border p-3">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Figure label="Revenue" value={formatCrore(result.revenue)} />
        <Figure label="Direct cost" value={formatCrore(result.directCost)} />
        <Figure label="Gross profit" value={formatCrore(result.grossProfit)} />
        <Figure
          label="Interest, alone"
          value={formatCrore(result.interest)}
          hint="unfunded, on its own"
        />
        <Figure
          label="Units sold"
          value={`${formatQuantity(result.unitsSold)} of ${formatQuantity(units)}`}
          hint={shortfall ? `${formatQuantity(result.unitsUnsold)} left at the horizon` : undefined}
          tone={shortfall ? "warn" : undefined}
        />
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
  tone?: "warn";
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p
        className={`truncate font-mono text-sm font-semibold ${tone === "warn" ? "text-warning" : "text-foreground"}`}
      >
        {value}
      </p>
      {hint ? <p className="text-muted truncate text-xs">{hint}</p> : null}
    </div>
  );
}
