"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { saveLine } from "@/lib/budgets/actions";
import { clientRate, lineAmount, rollUp } from "@/lib/budgets/math";
import { formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import type { BudgetSpaceGroup } from "@/lib/budgets/queries";
import { type ReactNode, useMemo, useState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { ApproveButton } from "./approve-button";

/** What the team can change on a line, as strings — these are inputs. */
type Draft = {
  quantity: string;
  vendorId: string;
  unitCost: string;
  marginPct: string;
  notes: string;
};

/** Empty stays empty: a blank cost means unpriced, which is not zero. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The pricing screen's grid.
 *
 * Every space is on one page rather than behind a rail: pricing is worked
 * through top to bottom in a sitting, and making someone navigate per room
 * would put a server round trip between them and the next line.
 *
 * All lines live in this component's state, so totals recompute as figures
 * are typed — before anything is saved. The saved value is what the
 * database holds; the arithmetic on screen comes from lib/budgets/math.ts,
 * the same formula as the generated column, so the two cannot disagree.
 */
export function PricingGrid({
  budgetId,
  selectionId,
  spaces,
  vendors,
  editable,
}: {
  budgetId: string;
  selectionId: string;
  spaces: BudgetSpaceGroup[];
  vendors: { id: string; name: string }[];
  editable: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const initial: Record<string, Draft> = {};
    for (const space of spaces) {
      for (const line of space.lines) {
        initial[line.line_key] = {
          quantity: String(line.quantity),
          vendorId: line.expected_vendor_id ?? "",
          unitCost: line.unit_cost === null ? "" : String(line.unit_cost),
          marginPct: line.margin_pct === null ? "" : String(line.margin_pct),
          notes: line.notes ?? "",
        };
      }
    }
    return initial;
  });

  const update = (lineKey: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [lineKey]: { ...current[lineKey], ...patch } }));
  };

  // Live totals across the whole budget, from what's on screen right now.
  const totals = useMemo(() => {
    const priced = Object.values(drafts).map((draft) => ({
      quantity: toNumber(draft.quantity) ?? 0,
      unit_cost: toNumber(draft.unitCost),
      margin_pct: toNumber(draft.marginPct),
    }));
    return rollUp(priced);
  }, [drafts]);

  return (
    <div className="space-y-6">
      {/* Approve lives here, not in the page header, because whether it is
          allowed depends on figures that only exist in this component's
          state — the team should be able to price the last line and
          approve without reloading. */}
      <SummaryBar
        totals={totals}
        action={
          editable ? (
            <ApproveButton
              budgetId={budgetId}
              pendingCount={totals.pendingCount}
              lineCount={totals.lineCount}
            />
          ) : null
        }
      />

      {spaces.map((space) => {
        const spaceTotals = rollUp(
          space.lines.map((line) => {
            const draft = drafts[line.line_key];
            return {
              quantity: toNumber(draft?.quantity ?? "") ?? 0,
              unit_cost: toNumber(draft?.unitCost ?? ""),
              margin_pct: toNumber(draft?.marginPct ?? ""),
            };
          }),
        );

        return (
          <section key={space.space_id} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-foreground text-sm font-semibold">{space.label}</h2>
                <p className="text-muted text-xs">{space.space_type_name}</p>
              </div>
              <p className="text-muted text-xs">
                {spaceTotals.pendingCount > 0 && (
                  <span className="text-warning">{spaceTotals.pendingCount} to price · </span>
                )}
                Cost {formatMoney(spaceTotals.cost)} · Client {formatMoney(spaceTotals.client)}
              </p>
            </div>

            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="w-14"></TableHeaderCell>
                  <TableHeaderCell className="min-w-[180px]">Item</TableHeaderCell>
                  <TableHeaderCell className="w-28">Qty</TableHeaderCell>
                  <TableHeaderCell className="w-36">Vendor</TableHeaderCell>
                  <TableHeaderCell className="w-28">Cost</TableHeaderCell>
                  <TableHeaderCell className="w-24">Margin %</TableHeaderCell>
                  <TableHeaderCell className="w-28">Client rate</TableHeaderCell>
                  <TableHeaderCell className="w-32">Amount</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {space.lines.map((line) => (
                  <PricingRow
                    key={line.line_key}
                    budgetId={budgetId}
                    selectionId={selectionId}
                    line={line}
                    draft={drafts[line.line_key]}
                    vendors={vendors}
                    editable={editable}
                    onChange={(patch) => update(line.line_key, patch)}
                  />
                ))}
              </TableBody>
            </Table>
          </section>
        );
      })}
    </div>
  );
}

function SummaryBar({ totals, action }: { totals: ReturnType<typeof rollUp>; action: ReactNode }) {
  return (
    <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-4 py-3">
      <div className="grid flex-1 gap-3 sm:grid-cols-4">
        <Figure label="Cost" value={formatMoney(totals.cost)} />
        <Figure label="Client" value={formatMoney(totals.client)} />
        <Figure
          label="Margin"
          value={formatMoney(totals.margin)}
          hint={totals.marginPct === null ? undefined : formatPercent(totals.marginPct)}
        />
        <Figure
          label="Priced"
          value={`${totals.pricedCount} of ${totals.lineCount}`}
          hint={totals.pendingCount > 0 ? `${totals.pendingCount} left` : "complete"}
        />
      </div>
      {action}
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p className="text-foreground text-sm font-semibold">
        {value}
        {hint && <span className="text-muted ml-1.5 text-xs font-normal">{hint}</span>}
      </p>
    </div>
  );
}

function PricingRow({
  budgetId,
  selectionId,
  line,
  draft,
  vendors,
  editable,
  onChange,
}: {
  budgetId: string;
  selectionId: string;
  line: BudgetSpaceGroup["lines"][number];
  draft: Draft;
  vendors: { id: string; name: string }[];
  editable: boolean;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const cost = toNumber(draft.unitCost);
  const margin = toNumber(draft.marginPct);
  const quantity = toNumber(draft.quantity);
  const rate = clientRate(cost, margin);
  const amount = lineAmount({ quantity: quantity ?? 0, unit_cost: cost, margin_pct: margin });

  // Saves on blur, not per keystroke — see the hook. saveLine
  // deliberately doesn't revalidate the route.
  const { flush, error, saved } = useSaveOnBlur<Draft>({
    initial: draft,
    validate: (value) => {
      const parsed = toNumber(value.quantity);
      return parsed !== null && parsed > 0 ? undefined : "Quantity must be more than 0";
    },
    save: (value) =>
      saveLine(budgetId, selectionId, line.line_key, {
        quantity: toNumber(value.quantity) ?? 0,
        expectedVendorId: value.vendorId || null,
        unitCost: toNumber(value.unitCost),
        marginPct: toNumber(value.marginPct),
        notes: value.notes || null,
      }),
  });

  const save = () => {
    if (!editable) return;
    flush(draft);
  };

  const quantityChanged = quantity !== null && quantity !== line.designer_quantity;

  return (
    <TableRow className={line.needs_review ? "bg-warning/5" : undefined}>
      <TableCell>
        <ItemThumb
          code={line.item_code}
          name={line.item_name}
          thumbUrl={line.item_thumb_url}
          sizes="48px"
          className="w-10"
        />
      </TableCell>

      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-foreground font-medium">{line.item_name}</span>
          {line.needs_review && <Badge variant="warning">Check</Badge>}
          {saved && <span className="text-success text-xs">Saved</span>}
        </div>
        <div className="text-muted text-xs">
          {line.item_brand ? `${line.item_brand} · ` : ""}
          {line.item_code ?? "—"}
          {/* The designer's rate at pick time. A sanity check on the cost
              being typed, never a price — it is not what anyone pays. */}
          {line.indicative_rate !== null && (
            <span className="ml-2 opacity-60">indicative {formatMoney(line.indicative_rate)}</span>
          )}
        </div>
        {line.designer_note && <p className="text-muted mt-0.5 text-xs">“{line.designer_note}”</p>}
        <FormMessage error={error} size="xs" className="mt-1" />
      </TableCell>

      <TableCell>
        {editable ? (
          <Input
            type="number"
            step="any"
            min="0"
            value={draft.quantity}
            onChange={(event) => onChange({ quantity: event.target.value })}
            onBlur={save}
            className="h-9"
            aria-label={`Quantity for ${line.item_name}`}
          />
        ) : (
          formatQuantity(line.quantity)
        )}
        <p className="text-muted mt-0.5 text-xs">
          {line.uom}
          {/* Shown only when the two differ, so a changed measurement is
              always answerable against what was designed. */}
          {quantityChanged && (
            <span className="text-warning ml-1">
              (designed {formatQuantity(line.designer_quantity)})
            </span>
          )}
        </p>
      </TableCell>

      <TableCell>
        {editable ? (
          <Select
            value={draft.vendorId}
            onChange={(event) => onChange({ vendorId: event.target.value })}
            onBlur={save}
            className="h-9"
            aria-label={`Vendor for ${line.item_name}`}
          >
            <option value="">—</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </Select>
        ) : (
          (vendors.find((vendor) => vendor.id === line.expected_vendor_id)?.name ?? "—")
        )}
      </TableCell>

      <TableCell>
        {editable ? (
          <Input
            type="number"
            step="any"
            min="0"
            value={draft.unitCost}
            placeholder="—"
            onChange={(event) => onChange({ unitCost: event.target.value })}
            onBlur={save}
            className="h-9"
            aria-label={`Unit cost for ${line.item_name}`}
          />
        ) : (
          formatMoney(line.unit_cost)
        )}
      </TableCell>

      <TableCell>
        {editable ? (
          <Input
            type="number"
            step="any"
            min="0"
            value={draft.marginPct}
            placeholder="—"
            onChange={(event) => onChange({ marginPct: event.target.value })}
            onBlur={save}
            className="h-9"
            aria-label={`Margin for ${line.item_name}`}
          />
        ) : (
          formatPercent(line.margin_pct)
        )}
      </TableCell>

      <TableCell className="text-muted">{formatMoney(rate)}</TableCell>
      <TableCell className="text-foreground font-medium">{formatMoney(amount)}</TableCell>
    </TableRow>
  );
}
