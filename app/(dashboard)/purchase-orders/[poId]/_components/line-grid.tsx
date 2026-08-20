"use client";

import { CataloguePickerDialog } from "@/components/masters/catalogue-picker";
import { ItemThumb } from "@/components/masters/item-thumb";
import { Attribution } from "@/components/ui/attribution";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
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
import { formatCount, formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import { addDirectPoLines, removePoLine, updatePoLine } from "@/lib/purchase-orders/actions";
import { lineTotal, rollUpPo, type PoLineMoney } from "@/lib/purchase-orders/math";
import type { PoLineRow } from "@/lib/purchase-orders/queries";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { PackageOpen, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

/**
 * The PO's lines with their money. Quantity, rate and GST are editable
 * in draft; the uom is not — it stays the indent line's unit, because
 * the over-ordering guard compares quantities in that unit. Totals
 * react as rates are typed (each row reports its money up), so the
 * figure at the bottom is always the figure being agreed to.
 */
type Option = { id: string; name: string };

export function LineGrid({
  poId,
  lines,
  editable,
  gstRates,
  categories,
  brands,
}: {
  poId: string;
  lines: PoLineRow[];
  editable: boolean;
  /** Active gst_rates from Masters, plus any inactive rate a line holds. */
  gstRates: number[];
  categories: Option[];
  brands: Option[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Live money per line, so the roll-up follows typing before a refresh.
  const [money, setMoney] = useState<Record<string, PoLineMoney>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        { quantity: line.quantity, rate: line.rate, gst_pct: line.gst_pct },
      ]),
    ),
  );

  const reportMoney = (lineId: string, value: PoLineMoney) =>
    setMoney((current) => ({ ...current, [lineId]: value }));

  const totals = rollUpPo(
    lines.map(
      (line) =>
        money[line.id] ?? { quantity: line.quantity, rate: line.rate, gst_pct: line.gst_pct },
    ),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-foreground text-lg font-bold tracking-tight">Lines</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted text-xs">
            {formatCount(lines.length)} {lines.length === 1 ? "line" : "lines"}
          </span>
          {editable && (
            <>
              <LinkButton href={`/purchase-orders/${poId}/pull`} size="sm" variant="secondary">
                From approved indents
              </LinkButton>
              <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
                Add items directly
              </Button>
            </>
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Nothing on this order yet"
          description={
            editable
              ? "Add lines from the approved indents for this scope — or directly for a bulk or urgent buy — then price them."
              : undefined
          }
          action={
            editable ? (
              <LinkButton href={`/purchase-orders/${poId}/pull`}>From approved indents</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-14"></TableHeaderCell>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell className="w-40">Qty</TableHeaderCell>
                <TableHeaderCell className="w-32">Rate</TableHeaderCell>
                <TableHeaderCell className="w-24">GST</TableHeaderCell>
                <TableHeaderCell className="w-32">Amount</TableHeaderCell>
                <TableHeaderCell>Note</TableHeaderCell>
                <TableHeaderCell className="w-12">By</TableHeaderCell>
                {editable && <TableHeaderCell className="w-12"></TableHeaderCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line) => (
                <LineRow
                  key={line.id}
                  poId={poId}
                  line={line}
                  editable={editable}
                  gstRates={gstRates}
                  onMoneyChange={reportMoney}
                />
              ))}
            </TableBody>
          </Table>

          <div className="border-border bg-surface ml-auto w-full max-w-sm space-y-1 rounded-2xl border p-4">
            <TotalRow label="Taxable value" value={formatMoney(totals.taxable)} />
            {[...totals.gstBySlab.entries()]
              .sort(([a], [b]) => a - b)
              .map(([slab, amount]) => (
                <TotalRow
                  key={slab}
                  label={`GST ${formatPercent(slab)}`}
                  value={formatMoney(amount)}
                />
              ))}
            <div className="border-border flex items-center justify-between border-t pt-2">
              <span className="text-foreground text-sm font-semibold">Grand total</span>
              <span className="text-foreground text-sm font-semibold">
                {formatMoney(totals.grand)}
              </span>
            </div>
            {totals.pendingCount > 0 && (
              <p className="text-warning text-xs font-medium">
                {formatCount(totals.pendingCount)}{" "}
                {totals.pendingCount === 1 ? "line still needs" : "lines still need"} a rate and GST
                — they&apos;re not in these totals.
              </p>
            )}
          </div>
        </>
      )}

      <CataloguePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Add items to the order"
        targetLabel="this purchase order"
        categories={categories}
        brands={brands}
        onCommit={(picked) =>
          addDirectPoLines(
            poId,
            picked.map(({ item, quantity }) => ({ itemId: item.id, quantity })),
          )
        }
      />
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted text-sm">{label}</span>
      <span className="text-foreground text-sm">{value}</span>
    </div>
  );
}

function LineRow({
  poId,
  line,
  editable,
  gstRates,
  onMoneyChange,
}: {
  poId: string;
  line: PoLineRow;
  editable: boolean;
  gstRates: number[];
  onMoneyChange: (lineId: string, value: PoLineMoney) => void;
}) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [rate, setRate] = useState(line.rate === null ? "" : String(line.rate));
  const [gst, setGst] = useState(line.gst_pct === null ? "" : String(line.gst_pct));
  const [note, setNote] = useState(line.note ?? "");
  const [removing, startTransition] = useTransition();

  // A line holding a rate that was later deactivated still shows it.
  const rateOptions = gstRates.includes(line.gst_pct ?? NaN)
    ? gstRates
    : line.gst_pct !== null
      ? [...gstRates, line.gst_pct].sort((a, b) => a - b)
      : gstRates;

  const { flush, error, setError, saved } = useSaveOnBlur({
    initial: {
      quantity: line.quantity,
      rate: line.rate,
      gstPct: line.gst_pct,
      note: line.note ?? "",
    },
    validate: ({ quantity: value }) =>
      Number.isFinite(value) && value > 0 ? undefined : "Quantity must be more than 0",
    save: ({ quantity: value, rate: money, gstPct, note: text }) =>
      updatePoLine(line.id, { quantity: value, rate: money, gstPct, note: text || null }),
  });

  const parsed = (nextGst = gst) => {
    const quantityValue = Number(quantity.trim());
    const rateValue = rate.trim() === "" ? null : Number(rate.trim());
    const gstValue = nextGst === "" ? null : Number(nextGst);
    return { quantityValue, rateValue, gstValue };
  };

  const save = (nextGst = gst) => {
    const { quantityValue, rateValue, gstValue } = parsed(nextGst);
    if (!Number.isFinite(quantityValue) || !(quantityValue > 0)) {
      setQuantity(String(line.quantity));
    }
    flush({ quantity: quantityValue, rate: rateValue, gstPct: gstValue, note });
  };

  const report = (nextGst = gst) => {
    const { quantityValue, rateValue, gstValue } = parsed(nextGst);
    onMoneyChange(line.id, {
      quantity: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : line.quantity,
      rate: rateValue !== null && Number.isFinite(rateValue) ? rateValue : null,
      gst_pct: gstValue !== null && Number.isFinite(gstValue) ? gstValue : null,
    });
  };

  const { quantityValue, rateValue, gstValue } = parsed();
  const amount = lineTotal({
    quantity: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : line.quantity,
    rate: rateValue !== null && Number.isFinite(rateValue) ? rateValue : null,
    gst_pct: gstValue !== null && Number.isFinite(gstValue) ? gstValue : null,
  });

  return (
    <TableRow className={removing ? "opacity-50" : undefined}>
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
        <span className="text-foreground font-medium">{line.item_name}</span>
        <div className="text-muted text-xs">
          {line.item_code ?? "—"}
          {line.item_brand && <span className="ml-2">{line.item_brand}</span>}
          <span className="ml-2 italic">
            {line.indent_reference ? `from ${line.indent_reference}` : "added directly"}
          </span>
        </div>
      </TableCell>
      {editable ? (
        <>
          <TableCell>
            {/* The input gets the full column; the uom sits under it —
                squeezing them side by side hid the number itself. */}
            <Input
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                report();
              }}
              onBlur={() => save()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="h-9 min-w-24"
              aria-label={`Quantity for ${line.item_name}`}
            />
            <p className="text-muted mt-1 text-xs">{line.uom}</p>
            <FormMessage
              error={error}
              success={saved ? "Saved" : undefined}
              size="xs"
              className="mt-1"
            />
          </TableCell>
          <TableCell>
            <Input
              type="number"
              step="any"
              min="0"
              value={rate}
              onChange={(event) => {
                setRate(event.target.value);
                report();
              }}
              onBlur={() => save()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              placeholder="—"
              className="h-9"
              aria-label={`Rate for ${line.item_name}`}
            />
          </TableCell>
          <TableCell>
            {/* Saved immediately on change — a select has no meaningful
                blur (the uom-select rule from the indent grid). */}
            <Select
              value={gst}
              onChange={(event) => {
                setGst(event.target.value);
                report(event.target.value);
                save(event.target.value);
              }}
              className="h-9"
              aria-label={`GST for ${line.item_name}`}
            >
              <option value="">—</option>
              {rateOptions.map((slab) => (
                <option key={slab} value={String(slab)}>
                  {slab}%
                </option>
              ))}
            </Select>
          </TableCell>
          <TableCell className="text-foreground text-sm">{formatMoney(amount)}</TableCell>
          <TableCell>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => save()}
              placeholder="—"
              className="h-9"
              aria-label={`Note for ${line.item_name}`}
            />
          </TableCell>
          <TableCell>
            <Attribution name={line.updated_by_name} label="Last edited by" />
          </TableCell>
          <TableCell>
            <IconButton
              aria-label={`Remove ${line.item_name}`}
              tone="danger"
              disabled={removing}
              onClick={() =>
                startTransition(async () => {
                  const result = await removePoLine(poId, line.id);
                  if (result?.error) setError(result.error);
                })
              }
            >
              <Trash2 className="size-4" />
            </IconButton>
          </TableCell>
        </>
      ) : (
        <>
          <TableCell>
            {formatQuantity(line.quantity)} <span className="text-muted text-xs">{line.uom}</span>
          </TableCell>
          <TableCell>{formatMoney(line.rate)}</TableCell>
          <TableCell className="text-muted">
            {line.gst_pct === null ? "—" : formatPercent(line.gst_pct)}
          </TableCell>
          <TableCell>{formatMoney(amount)}</TableCell>
          <TableCell className="text-muted">{line.note ?? "—"}</TableCell>
          <TableCell>
            <Attribution name={line.updated_by_name} label="Last edited by" />
          </TableCell>
        </>
      )}
    </TableRow>
  );
}
