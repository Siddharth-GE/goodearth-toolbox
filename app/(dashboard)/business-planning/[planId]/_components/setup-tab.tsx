"use client";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { FieldRow, Section } from "@/components/ui/section";
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
 * Grouped by the question each answers, not by data type. The founder
 * does not think "these are the percentages" — they think "how is the
 * land being paid for".
 *
 * Most of it starts folded. Twenty-two fields set once a month should not
 * be the first thing the tab shows, and the ones that matter on a normal
 * visit — the horizon, the rate, the land deal — are the two sections
 * left open. Every folded section still reports its own total in its
 * header, so the money is visible without opening anything.
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
  const oneTimeTotal = inputs.oneTimeCosts.reduce((total, item) => total + item.amount, 0);
  const infraCapex = inputs.commonInfra.reduce((total, item) => total + item.capex, 0);

  return (
    <div className="space-y-3">
      <Section
        title="Horizon & money"
        note="How long the plan runs, and what it costs to fund the gap."
      >
        <FieldRow cols={4}>
          <MonthField
            label="Plan horizon"
            value={inputs.horizonMonths}
            onChange={(horizonMonths) => onChange({ horizonMonths })}
            hint={`${(inputs.horizonMonths / 12).toFixed(1)} years — cash after this is outside the plan`}
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
        </FieldRow>
      </Section>

      <Section
        title="The land deal"
        note="One deal for the whole project. Each line still carries its own area and rate."
      >
        <FieldRow cols={3}>
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
        </FieldRow>
      </Section>

      <Section
        title="How buyers pay"
        note="The default for every line. A line can override both."
        collapsible
        defaultOpen={false}
        aside={
          <span className="text-muted font-mono text-xs">
            {inputs.bookingPct}% then {inputs.instalments}
          </span>
        }
      >
        <FieldRow cols={3}>
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
        </FieldRow>
      </Section>

      <Section
        title="Overheads"
        note="Retainers and salaries that run every month, whatever sells."
        collapsible
        defaultOpen={false}
        aside={
          <span className="text-foreground font-mono text-xs font-semibold">
            {fixedMonthly > 0 ? `${formatCrore(fixedMonthly)} / month` : "none"}
          </span>
        }
      >
        <List
          empty={inputs.overheads.length === 0 ? "No overheads yet." : undefined}
          addLabel="Add overhead"
          onAdd={() => onChange({ overheads: [...inputs.overheads, newOverhead()] })}
        >
          {inputs.overheads.map((item, index) => (
            <Row
              key={item.id}
              cols={5}
              onRemove={() =>
                onChange({ overheads: inputs.overheads.filter((row) => row.id !== item.id) })
              }
              removeLabel={`Remove ${item.name || "overhead"}`}
            >
              <TextField
                label="Item"
                value={item.name}
                placeholder="Marketing retainer"
                onChange={(name) =>
                  onChange({ overheads: patch(inputs.overheads, index, { name }) })
                }
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
        </List>
      </Section>

      <Section
        title="Selling cost"
        note="Scales with bookings: brokerage, ads, referrals."
        collapsible
        defaultOpen={false}
        aside={
          <span className="text-foreground font-mono text-xs font-semibold">
            {variableRate > 0 ? `${variableRate.toFixed(2)}% of bookings` : "none"}
          </span>
        }
      >
        <List
          empty={inputs.variableCosts.length === 0 ? "No selling costs yet." : undefined}
          addLabel="Add selling cost"
          onAdd={() => onChange({ variableCosts: [...inputs.variableCosts, newVariableCost()] })}
        >
          {inputs.variableCosts.map((item, index) => (
            <Row
              key={item.id}
              cols={3}
              onRemove={() =>
                onChange({
                  variableCosts: inputs.variableCosts.filter((row) => row.id !== item.id),
                })
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
        </List>
      </Section>

      <Section
        title="One-time costs"
        note="A single spend in a single month."
        collapsible
        defaultOpen={false}
        aside={
          <span className="text-foreground font-mono text-xs font-semibold">
            {oneTimeTotal > 0 ? formatCrore(oneTimeTotal) : "none"}
          </span>
        }
      >
        <List
          empty={inputs.oneTimeCosts.length === 0 ? "No one-time costs yet." : undefined}
          addLabel="Add one-time cost"
          onAdd={() => onChange({ oneTimeCosts: [...inputs.oneTimeCosts, newOneTimeCost()] })}
        >
          {inputs.oneTimeCosts.map((item, index) => (
            <Row
              key={item.id}
              cols={4}
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
        </List>
      </Section>

      <Section
        title="Common infrastructure"
        note="Roads, a clubhouse, a biodiversity park — what the project shares and no line owns."
        collapsible
        defaultOpen={false}
        aside={
          <span className="text-foreground font-mono text-xs font-semibold">
            {infraCapex > 0 ? formatCrore(infraCapex) : "none"}
          </span>
        }
      >
        <List
          empty={inputs.commonInfra.length === 0 ? "Nothing shared yet." : undefined}
          addLabel="Add shared item"
          onAdd={() => onChange({ commonInfra: [...inputs.commonInfra, newCommonInfra()] })}
        >
          {inputs.commonInfra.map((item, index) => (
            <Row
              key={item.id}
              cols={6}
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
        </List>
      </Section>
    </div>
  );
}

/** Replace one row of a list, leaving the rest alone. */
function patch<T>(rows: T[], index: number, changes: Partial<T>): T[] {
  return rows.map((row, i) => (i === index ? { ...row, ...changes } : row));
}

/**
 * The rows of a repeatable cost list, with its Add button underneath.
 *
 * The button sits in the body rather than in the section header so that
 * adding a row is never possible while the section is folded — a new
 * empty row appearing somewhere you cannot see it is a small mystery
 * nobody needs.
 */
function List({
  empty,
  addLabel,
  onAdd,
  children,
}: {
  empty?: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {empty ? <p className="text-muted text-sm">{empty}</p> : children}
      <Button variant="ghost" size="sm" onClick={onAdd}>
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}

/**
 * One row of a repeatable list, on a track that matches how many fields
 * it actually has.
 *
 * `cols` is not decoration: a two-field selling-cost row used to lay out
 * on the same six-column grid as a six-field infrastructure row, leaving
 * two thirds of it empty.
 *
 * The delete button is built as a field with a blank label rather than
 * nudged down by a fixed margin. It lines up with the inputs because it
 * has the same structure they do, and it stays lined up if the label ever
 * changes size.
 */
function Row({
  children,
  cols,
  onRemove,
  removeLabel,
}: {
  children: ReactNode;
  cols: 3 | 4 | 5 | 6;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="border-border flex items-start gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <FieldRow cols={cols} className="flex-1">
        {children}
      </FieldRow>
      <div className="shrink-0 space-y-1">
        <span className="text-muted block text-xs font-medium" aria-hidden>
          &nbsp;
        </span>
        <IconButton aria-label={removeLabel} tone="danger" size="sm" onClick={onRemove}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}
