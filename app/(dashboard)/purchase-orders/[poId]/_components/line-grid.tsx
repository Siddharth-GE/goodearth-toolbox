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
import {
  lineChargesProblem,
  lineFigures,
  rollUpPo,
  summaryRows,
  type PoLineFigures,
  type PoLineMoney,
} from "@/lib/purchase-orders/math";
import type { PoLineRow } from "@/lib/purchase-orders/queries";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { PackageOpen, Trash2 } from "lucide-react";
import { useState, useTransition, type KeyboardEvent } from "react";

/**
 * The PO's lines with their money. Quantity, rate, discount (a % or ₹),
 * GST and other charges are editable in draft; the uom is not — it stays
 * the indent line's unit, because the over-ordering guard compares
 * quantities in that unit. Totals react as figures are typed (each row
 * reports its money up), so the figure at the bottom is always the
 * figure being agreed to. `interState` — the vendor's GST state against
 * the company's, worked out on the server — decides CGST + SGST or IGST.
 */
type Option = { id: string; name: string };

const moneyOf = (line: PoLineRow): PoLineMoney => ({
  quantity: line.quantity,
  rate: line.rate,
  gst_pct: line.gst_pct,
  discount_pct: line.discount_pct,
  discount_amount: line.discount_amount,
  other_charges: line.other_charges,
});

export function LineGrid({
  poId,
  lines,
  editable,
  interState,
  gstRates,
  categories,
  brands,
}: {
  poId: string;
  lines: PoLineRow[];
  editable: boolean;
  interState: boolean;
  /** Active gst_rates from Masters, plus any inactive rate a line holds. */
  gstRates: number[];
  categories: Option[];
  brands: Option[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Live money per line, so the roll-up follows typing before a refresh.
  const [money, setMoney] = useState<Record<string, PoLineMoney>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, moneyOf(line)])),
  );

  const reportMoney = (lineId: string, value: PoLineMoney) =>
    setMoney((current) => ({ ...current, [lineId]: value }));

  const totals = rollUpPo(
    lines.map((line) => money[line.id] ?? moneyOf(line)),
    interState,
  );
  // Nothing can be billed against a draft, so its grid has no Invoiced column.
  const showInvoiced = !editable;

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
                <TableHeaderCell className="w-14 px-3"></TableHeaderCell>
                <TableHeaderCell className="min-w-48 px-3">Item</TableHeaderCell>
                <TableHeaderCell className="w-28 px-3">Qty</TableHeaderCell>
                {showInvoiced && <TableHeaderCell className="w-24 px-3">Invoiced</TableHeaderCell>}
                <TableHeaderCell className="w-28 px-3">Rate</TableHeaderCell>
                <TableHeaderCell className="w-36 px-3">Discount</TableHeaderCell>
                <TableHeaderCell className="w-24 px-3">GST</TableHeaderCell>
                <TableHeaderCell className="w-28 px-3">Other charges</TableHeaderCell>
                <TableHeaderCell className="w-32 px-3">Amount</TableHeaderCell>
                <TableHeaderCell className="w-12 px-3">By</TableHeaderCell>
                {editable && <TableHeaderCell className="w-12 px-3"></TableHeaderCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line) => (
                <LineRow
                  key={line.id}
                  poId={poId}
                  line={line}
                  editable={editable}
                  interState={interState}
                  showInvoiced={showInvoiced}
                  gstRates={gstRates}
                  onMoneyChange={reportMoney}
                />
              ))}
            </TableBody>
          </Table>

          <div className="border-border bg-surface ml-auto w-full max-w-sm space-y-1 rounded-2xl border p-4">
            {summaryRows(totals, interState).map((row) => (
              <TotalRow key={row.label} label={row.label} value={formatMoney(row.amount)} />
            ))}
            <div className="border-border flex items-center justify-between border-t pt-2">
              <span className="text-foreground text-sm font-semibold">Grand total</span>
              <span className="text-foreground text-sm font-semibold tabular-nums">
                {formatMoney(totals.grand)}
              </span>
            </div>
            {totals.pendingCount > 0 && (
              <p className="text-warning text-xs font-medium">
                {/* One string: split across JSX lines, the space before
                    "a rate" was dropped in the built page. */}
                {`${formatCount(totals.pendingCount)} ${
                  totals.pendingCount === 1 ? "line still needs" : "lines still need"
                } a rate and GST — they're not in these totals.`}
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
      <span className="text-foreground text-sm tabular-nums">{value}</span>
    </div>
  );
}

/** What the item is and where it came from — the same in both modes. */
function ItemDetails({ line }: { line: PoLineRow }) {
  const meta = [line.item_code, line.item_brand, line.item_category].filter(Boolean);
  return (
    <>
      <span className="text-foreground font-medium">{line.item_name}</span>
      <div className="text-muted text-xs">{meta.length > 0 ? meta.join(" · ") : "—"}</div>
      {line.item_description && (
        <div className="text-muted line-clamp-2 text-xs">{line.item_description}</div>
      )}
      <div className="text-muted text-xs italic">
        {line.indent_reference ? `from ${line.indent_reference}` : "added directly"}
        {line.work_label && ` · ${line.work_label}`}
      </div>
    </>
  );
}

/** The amount, and what it is made of beneath — one short part a line. */
function AmountCell({
  figures,
  interState,
}: {
  figures: PoLineFigures | null;
  interState: boolean;
}) {
  return (
    <TableCell className="px-3 font-mono whitespace-nowrap">
      {formatMoney(figures?.total)}
      {figures && (
        <div className="text-muted mt-1 font-sans text-xs">
          <div>{`${formatMoney(figures.taxable)} before tax`}</div>
          <div>{`${formatMoney(figures.gst)} ${interState ? "IGST" : "CGST + SGST"}`}</div>
          {figures.other > 0 && <div>{`${formatMoney(figures.other)} other`}</div>}
        </div>
      )}
    </TableCell>
  );
}

type DiscountMode = "pct" | "amount";

/** Blank is null; anything else is the number typed (NaN if it isn't one). */
const typed = (text: string) => (text.trim() === "" ? null : Number(text.trim()));
const finiteOrNull = (value: number | null) =>
  value !== null && Number.isFinite(value) ? value : null;

function LineRow({
  poId,
  line,
  editable,
  interState,
  showInvoiced,
  gstRates,
  onMoneyChange,
}: {
  poId: string;
  line: PoLineRow;
  editable: boolean;
  interState: boolean;
  showInvoiced: boolean;
  gstRates: number[];
  onMoneyChange: (lineId: string, value: PoLineMoney) => void;
}) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [rate, setRate] = useState(line.rate === null ? "" : String(line.rate));
  const [gst, setGst] = useState(line.gst_pct === null ? "" : String(line.gst_pct));
  const [discountMode, setDiscountMode] = useState<DiscountMode>(
    line.discount_amount != null ? "amount" : "pct",
  );
  const [discount, setDiscount] = useState(String(line.discount_amount ?? line.discount_pct ?? ""));
  const [charges, setCharges] = useState(
    line.other_charges === null ? "" : String(line.other_charges),
  );
  const [note, setNote] = useState(line.note ?? "");
  const [removing, startTransition] = useTransition();

  // A line holding a rate that was later deactivated still shows it.
  const rateOptions = gstRates.includes(line.gst_pct ?? NaN)
    ? gstRates
    : line.gst_pct !== null
      ? [...gstRates, line.gst_pct].sort((a, b) => a - b)
      : gstRates;

  type Fields = {
    quantity: number;
    rate: number | null;
    gstPct: number | null;
    discountPct: number | null;
    discountAmount: number | null;
    otherCharges: number | null;
    note: string;
  };

  const { flush, error, setError, saved } = useSaveOnBlur<Fields>({
    initial: {
      quantity: line.quantity,
      rate: line.rate,
      gstPct: line.gst_pct,
      discountPct: line.discount_pct,
      discountAmount: line.discount_amount,
      otherCharges: line.other_charges,
      note: line.note ?? "",
    },
    validate: (value) => {
      if (!(Number.isFinite(value.quantity) && value.quantity > 0)) {
        return "Quantity must be more than 0";
      }
      return lineChargesProblem({
        quantity: value.quantity,
        rate: value.rate,
        gst_pct: value.gstPct,
        discount_pct: value.discountPct,
        discount_amount: value.discountAmount,
        other_charges: value.otherCharges,
      });
    },
    save: (value) => updatePoLine(line.id, { ...value, note: value.note || null }),
  });

  // Every field as it stands, with the one just changed passed in — the
  // state setter has not landed yet when its onChange reports.
  const fields = (
    changed: Partial<{
      quantity: string;
      rate: string;
      gst: string;
      discount: string;
      mode: DiscountMode;
      charges: string;
    }> = {},
  ): Fields => {
    const mode = changed.mode ?? discountMode;
    const discountValue = typed(changed.discount ?? discount);
    return {
      quantity: Number((changed.quantity ?? quantity).trim()),
      rate: typed(changed.rate ?? rate),
      gstPct: typed(changed.gst ?? gst),
      discountPct: mode === "pct" ? discountValue : null,
      discountAmount: mode === "amount" ? discountValue : null,
      otherCharges: typed(changed.charges ?? charges),
      note,
    };
  };

  const liveMoney = (value: Fields): PoLineMoney => ({
    quantity:
      Number.isFinite(value.quantity) && value.quantity > 0 ? value.quantity : line.quantity,
    rate: finiteOrNull(value.rate),
    gst_pct: finiteOrNull(value.gstPct),
    discount_pct: finiteOrNull(value.discountPct),
    discount_amount: finiteOrNull(value.discountAmount),
    other_charges: finiteOrNull(value.otherCharges),
  });

  const report = (changed: Parameters<typeof fields>[0]) =>
    onMoneyChange(line.id, liveMoney(fields(changed)));

  const save = (changed: Parameters<typeof fields>[0] = {}) => {
    const value = fields(changed);
    if (!(Number.isFinite(value.quantity) && value.quantity > 0)) {
      setQuantity(String(line.quantity));
    }
    flush(value);
  };

  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
  };

  const figures = lineFigures(editable ? liveMoney(fields()) : moneyOf(line), interState);

  if (!editable) {
    return (
      <TableRow>
        <TableCell className="px-3">
          <ItemThumb
            code={line.item_code}
            name={line.item_name}
            thumbUrl={line.item_thumb_url}
            sizes="48px"
            className="w-10"
          />
        </TableCell>
        <TableCell className="px-3">
          <ItemDetails line={line} />
          {line.note && <div className="text-muted mt-1 text-xs">Note: {line.note}</div>}
        </TableCell>
        <TableCell className="px-3 whitespace-nowrap">
          {formatQuantity(line.quantity)} <span className="text-muted text-xs">{line.uom}</span>
        </TableCell>
        {showInvoiced && (
          <TableCell className="px-3 whitespace-nowrap">
            {formatQuantity(line.billed_quantity)}
          </TableCell>
        )}
        <TableCell className="px-3 font-mono">{formatMoney(line.rate)}</TableCell>
        <TableCell className="text-muted px-3 font-mono">
          {line.discount_pct != null
            ? formatPercent(line.discount_pct)
            : line.discount_amount != null
              ? formatMoney(line.discount_amount)
              : "—"}
        </TableCell>
        <TableCell className="text-muted px-3">
          {line.gst_pct === null ? "—" : formatPercent(line.gst_pct)}
        </TableCell>
        <TableCell className="text-muted px-3 font-mono">
          {line.other_charges ? formatMoney(line.other_charges) : "—"}
        </TableCell>
        <AmountCell figures={figures} interState={interState} />
        <TableCell className="px-3">
          <Attribution name={line.updated_by_name} label="Last edited by" />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className={removing ? "opacity-50" : undefined}>
      <TableCell className="px-3">
        <ItemThumb
          code={line.item_code}
          name={line.item_name}
          thumbUrl={line.item_thumb_url}
          sizes="48px"
          className="w-10"
        />
      </TableCell>
      <TableCell className="px-3">
        <ItemDetails line={line} />
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => save()}
          onKeyDown={commitOnEnter}
          placeholder="Line note"
          className="mt-2 h-8 text-xs"
          aria-label={`Note for ${line.item_name}`}
        />
      </TableCell>
      <TableCell className="px-3">
        {/* The input gets the full column; the uom sits under it —
            squeezing them side by side hid the number itself. */}
        <Input
          type="number"
          step="any"
          min="0"
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
            report({ quantity: event.target.value });
          }}
          onBlur={() => save()}
          onKeyDown={commitOnEnter}
          className="h-9 min-w-20"
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
      <TableCell className="px-3">
        <Input
          type="number"
          step="any"
          min="0"
          value={rate}
          onChange={(event) => {
            setRate(event.target.value);
            report({ rate: event.target.value });
          }}
          onBlur={() => save()}
          onKeyDown={commitOnEnter}
          placeholder="—"
          className="h-9 min-w-20"
          aria-label={`Rate for ${line.item_name}`}
        />
        <p className="text-muted mt-1 text-xs">per {line.uom}</p>
      </TableCell>
      <TableCell className="px-3">
        <div className="flex gap-1.5">
          <Input
            type="number"
            step="any"
            min="0"
            value={discount}
            onChange={(event) => {
              setDiscount(event.target.value);
              report({ discount: event.target.value });
            }}
            onBlur={() => save()}
            onKeyDown={commitOnEnter}
            placeholder="—"
            className="h-9 min-w-16"
            aria-label={`Discount for ${line.item_name}`}
          />
          {/* Saved immediately on change — a select has no meaningful
              blur (the uom-select rule from the indent grid). */}
          <Select
            value={discountMode}
            onChange={(event) => {
              const mode = event.target.value as DiscountMode;
              setDiscountMode(mode);
              report({ mode });
              save({ mode });
            }}
            className="h-9 w-14 shrink-0 px-2"
            aria-label={`Discount in per cent or rupees for ${line.item_name}`}
          >
            <option value="pct">%</option>
            <option value="amount">₹</option>
          </Select>
        </div>
      </TableCell>
      <TableCell className="px-3">
        <Select
          value={gst}
          onChange={(event) => {
            setGst(event.target.value);
            report({ gst: event.target.value });
            save({ gst: event.target.value });
          }}
          className="h-9 min-w-20 px-2.5"
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
      <TableCell className="px-3">
        <Input
          type="number"
          step="any"
          min="0"
          value={charges}
          onChange={(event) => {
            setCharges(event.target.value);
            report({ charges: event.target.value });
          }}
          onBlur={() => save()}
          onKeyDown={commitOnEnter}
          placeholder="—"
          className="h-9 min-w-20"
          aria-label={`Other charges for ${line.item_name}`}
        />
        <p className="text-muted mt-1 text-xs">₹, after GST</p>
      </TableCell>
      <AmountCell figures={figures} interState={interState} />
      <TableCell className="px-3">
        <Attribution name={line.updated_by_name} label="Last edited by" />
      </TableCell>
      <TableCell className="px-3">
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
    </TableRow>
  );
}
