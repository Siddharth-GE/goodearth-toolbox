"use client";

import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Select } from "@/components/ui/select";
import {
  newCommonInfra,
  newOneTimeCost,
  newOverhead,
  newVariableCost,
  type PlanInputs,
} from "@/lib/business-planning/inputs";
import { formatCrore } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { MoneyField, MonthField, NumberField, PercentField, TextField } from "./fields";

/**
 * Everything that belongs to the whole project rather than to one line:
 * the horizon, the money, the land deal, and the costs no single product
 * owns.
 *
 * Grouped into cards by the question each answers, not by data type. The
 * founder does not think "these are the percentages" — they think "how
 * is the land being paid for".
 */
export function SetupTab({
  inputs,
  onChange,
}: {
  inputs: PlanInputs;
  onChange: (patch: Partial<PlanInputs>) => void;
}) {
  const isJv = inputs.landTerms === "jv";
  const variableRate = inputs.variableCosts.reduce((total, item) => total + item.pct, 0);
  const fixedMonthly = inputs.overheads.reduce((total, item) => total + item.monthly, 0);

  return (
    <div className="space-y-4">
      <Panel
        title="Horizon & money"
        note="How long the plan runs, and what it costs to fund the gap."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MonthField
            label="Plan horizon"
            value={inputs.horizonMonths}
            onChange={(horizonMonths) => onChange({ horizonMonths })}
            hint={`${(inputs.horizonMonths / 12).toFixed(1)} years — anything after this is outside the plan`}
          />
          <PercentField
            label="Financing rate (annual)"
            value={inputs.financingRatePct}
            onChange={(financingRatePct) => onChange({ financingRatePct })}
            hint="charged on any month the cash pool ends negative"
          />
          <MoneyField
            label="Opening equity"
            value={inputs.openingEquity}
            onChange={(openingEquity) => onChange({ openingEquity })}
            hint="in the pool at month 1"
          />
          <MonthField
            label="Development period"
            value={inputs.devMonths}
            onChange={(devMonths) => onChange({ devMonths })}
            hint="infra spend spreads evenly over this, from month 1"
          />
        </div>
      </Panel>

      <Panel
        title="The land deal"
        note="One deal for the whole project. Each line still carries its own area and rate."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 space-y-1">
            <label htmlFor="land-terms" className="text-muted block text-xs font-medium">
              Paid how
            </label>
            <Select
              id="land-terms"
              value={inputs.landTerms}
              onChange={(event) =>
                onChange({ landTerms: event.target.value === "jv" ? "jv" : "cash" })
              }
              className="h-9"
            >
              <option value="cash">Cash, up front</option>
              <option value="jv">JV, settled later</option>
            </Select>
            <p className="text-muted text-xs">
              {isJv
                ? "no money out until settlement, at a premium"
                : "the whole amount leaves in month 1"}
            </p>
          </div>
          {isJv ? (
            <>
              <PercentField
                label="Premium for deferring"
                value={inputs.landPremiumPct}
                onChange={(landPremiumPct) => onChange({ landPremiumPct })}
                hint="what the landowner is paid over the cash price"
              />
              <MonthField
                label="Settlement month"
                value={inputs.landSettlementMonth}
                onChange={(landSettlementMonth) => onChange({ landSettlementMonth })}
                hint={
                  inputs.landSettlementMonth > inputs.horizonMonths
                    ? "past the horizon — this land is never paid for in this plan"
                    : `year ${Math.ceil(inputs.landSettlementMonth / 12)}`
                }
              />
            </>
          ) : null}
        </div>
      </Panel>

      <Panel title="How buyers pay" note="The default for every line. A line can override both.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PercentField
            label="Paid on booking"
            value={inputs.bookingPct}
            onChange={(bookingPct) => onChange({ bookingPct })}
            hint="lands the month a unit sells"
          />
          <NumberField
            label="Instalments"
            value={inputs.instalments}
            onChange={(instalments) => onChange({ instalments })}
            step="1"
            min={1}
            hint={`the other ${(100 - inputs.bookingPct).toFixed(0)}%, spread across the build`}
          />
        </div>
      </Panel>

      <Panel
        title="Overheads"
        note="Retainers and salaries that run every month, whatever sells."
        total={fixedMonthly > 0 ? `${formatCrore(fixedMonthly)} / month` : undefined}
        onAdd={() => onChange({ overheads: [...inputs.overheads, newOverhead()] })}
        addLabel="Add overhead"
        empty={inputs.overheads.length === 0 ? "No overheads yet." : undefined}
      >
        {inputs.overheads.map((item, index) => (
          <Row
            key={item.id}
            onRemove={() =>
              onChange({ overheads: inputs.overheads.filter((row) => row.id !== item.id) })
            }
            removeLabel={`Remove ${item.name || "overhead"}`}
          >
            <TextField
              label="Item"
              value={item.name}
              placeholder="Marketing retainer"
              onChange={(name) => onChange({ overheads: patch(inputs.overheads, index, { name }) })}
              className="sm:col-span-2"
            />
            <MoneyField
              label="Per month"
              value={item.monthly}
              onChange={(monthly) =>
                onChange({ overheads: patch(inputs.overheads, index, { monthly }) })
              }
            />
            <MonthField
              label="From"
              value={item.startMonth}
              onChange={(startMonth) =>
                onChange({ overheads: patch(inputs.overheads, index, { startMonth }) })
              }
            />
            <MonthField
              label="To"
              value={item.endMonth}
              onChange={(endMonth) =>
                onChange({ overheads: patch(inputs.overheads, index, { endMonth }) })
              }
              hint={
                item.endMonth < item.startMonth
                  ? "ends before it starts — costs nothing"
                  : undefined
              }
            />
          </Row>
        ))}
      </Panel>

      <Panel
        title="Selling cost"
        note="Scales with bookings: brokerage, ads, referrals."
        total={variableRate > 0 ? `${variableRate.toFixed(2)}% of bookings` : undefined}
        onAdd={() => onChange({ variableCosts: [...inputs.variableCosts, newVariableCost()] })}
        addLabel="Add selling cost"
        empty={inputs.variableCosts.length === 0 ? "No selling costs yet." : undefined}
      >
        {inputs.variableCosts.map((item, index) => (
          <Row
            key={item.id}
            onRemove={() =>
              onChange({ variableCosts: inputs.variableCosts.filter((row) => row.id !== item.id) })
            }
            removeLabel={`Remove ${item.name || "selling cost"}`}
          >
            <TextField
              label="Item"
              value={item.name}
              placeholder="Brokerage / channel"
              onChange={(name) =>
                onChange({ variableCosts: patch(inputs.variableCosts, index, { name }) })
              }
              className="sm:col-span-2"
            />
            <PercentField
              label="Of bookings"
              value={item.pct}
              onChange={(pct) =>
                onChange({ variableCosts: patch(inputs.variableCosts, index, { pct }) })
              }
            />
          </Row>
        ))}
      </Panel>

      <Panel
        title="One-time costs"
        note="A single spend in a single month."
        onAdd={() => onChange({ oneTimeCosts: [...inputs.oneTimeCosts, newOneTimeCost()] })}
        addLabel="Add one-time cost"
        empty={inputs.oneTimeCosts.length === 0 ? "No one-time costs yet." : undefined}
      >
        {inputs.oneTimeCosts.map((item, index) => (
          <Row
            key={item.id}
            onRemove={() =>
              onChange({ oneTimeCosts: inputs.oneTimeCosts.filter((row) => row.id !== item.id) })
            }
            removeLabel={`Remove ${item.name || "one-time cost"}`}
          >
            <TextField
              label="Item"
              value={item.name}
              placeholder="Show / model unit"
              onChange={(name) =>
                onChange({ oneTimeCosts: patch(inputs.oneTimeCosts, index, { name }) })
              }
              className="sm:col-span-2"
            />
            <MoneyField
              label="Amount"
              value={item.amount}
              onChange={(amount) =>
                onChange({ oneTimeCosts: patch(inputs.oneTimeCosts, index, { amount }) })
              }
            />
            <MonthField
              label="Month"
              value={item.month}
              onChange={(month) =>
                onChange({ oneTimeCosts: patch(inputs.oneTimeCosts, index, { month }) })
              }
            />
          </Row>
        ))}
      </Panel>

      <Panel
        title="Common infrastructure"
        note="Roads, a clubhouse, a biodiversity park — what the project shares and no line owns."
        onAdd={() => onChange({ commonInfra: [...inputs.commonInfra, newCommonInfra()] })}
        addLabel="Add shared item"
        empty={inputs.commonInfra.length === 0 ? "Nothing shared yet." : undefined}
      >
        {inputs.commonInfra.map((item, index) => (
          <Row
            key={item.id}
            onRemove={() =>
              onChange({ commonInfra: inputs.commonInfra.filter((row) => row.id !== item.id) })
            }
            removeLabel={`Remove ${item.name || "shared item"}`}
          >
            <TextField
              label="Item"
              value={item.name}
              placeholder="Biodiversity park"
              onChange={(name) =>
                onChange({ commonInfra: patch(inputs.commonInfra, index, { name }) })
              }
              className="sm:col-span-2"
            />
            <MoneyField
              label="Capex"
              value={item.capex}
              onChange={(capex) =>
                onChange({ commonInfra: patch(inputs.commonInfra, index, { capex }) })
              }
            />
            <MonthField
              label="Capex from"
              value={item.capexStartMonth}
              onChange={(capexStartMonth) =>
                onChange({ commonInfra: patch(inputs.commonInfra, index, { capexStartMonth }) })
              }
            />
            <MonthField
              label="Spread over"
              value={item.capexMonths}
              onChange={(capexMonths) =>
                onChange({ commonInfra: patch(inputs.commonInfra, index, { capexMonths }) })
              }
            />
            <MoneyField
              label="Opex / year"
              value={item.annualOpex}
              onChange={(annualOpex) =>
                onChange({ commonInfra: patch(inputs.commonInfra, index, { annualOpex }) })
              }
              hint="runs monthly to the horizon"
            />
          </Row>
        ))}
      </Panel>
    </div>
  );
}

/** Replace one row of a list, leaving the rest alone. */
function patch<T>(rows: T[], index: number, changes: Partial<T>): T[] {
  return rows.map((row, i) => (i === index ? { ...row, ...changes } : row));
}

function Panel({
  title,
  note,
  total,
  onAdd,
  addLabel,
  empty,
  children,
}: {
  title: string;
  note: string;
  total?: string;
  onAdd?: () => void;
  addLabel?: string;
  /** Shown instead of children when the list is empty. */
  empty?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-foreground text-sm font-semibold">{title}</h2>
          <p className="text-muted text-xs">{note}</p>
        </div>
        <div className="flex items-center gap-3">
          {total ? <span className="text-foreground font-mono text-xs">{total}</span> : null}
          {onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              className="text-accent inline-flex items-center gap-1 text-xs font-medium hover:underline"
            >
              <Plus className="size-3.5" />
              {addLabel}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {empty ? <p className="text-muted text-sm">{empty}</p> : children}
      </div>
    </Card>
  );
}

function Row({
  children,
  onRemove,
  removeLabel,
}: {
  children: ReactNode;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="border-border flex items-start gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="grid flex-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>
      <IconButton
        aria-label={removeLabel}
        tone="danger"
        size="sm"
        onClick={onRemove}
        className="mt-5"
      >
        <Trash2 className="size-4" />
      </IconButton>
    </div>
  );
}
