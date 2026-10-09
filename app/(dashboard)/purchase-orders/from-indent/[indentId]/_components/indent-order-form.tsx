"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatMoney, formatQuantity } from "@/lib/format";
import { createPosFromIndent } from "@/lib/purchase-orders/actions";
import {
  picksProblem,
  priceKey,
  splitByVendor,
  type IndentPick,
  type PriceSuggestion,
} from "@/lib/purchase-orders/from-indent";
import type { IndentOrderLine } from "@/lib/purchase-orders/queries";
import { useMemo, useState, useTransition } from "react";

/**
 * Every line left to buy, ticked, with its vendor, rate and GST already
 * suggested from the last purchase of that item. Nothing is written until
 * Create, which makes one draft PO per vendor — the bar at the foot says
 * how many before it is pressed.
 */
type Row = {
  picked: boolean;
  quantity: string;
  vendorId: string;
  rate: string;
  gst: string;
};

const asText = (value: number | null | undefined) => (value == null ? "" : String(value));
const typed = (text: string) => (text.trim() === "" ? null : Number(text.trim()));

export function IndentOrderForm({
  indentId,
  lines,
  vendors,
  prices,
  gstRates,
  blocked,
}: {
  indentId: string;
  lines: IndentOrderLine[];
  vendors: { id: string; name: string }[];
  /** Each vendor's last price per item, keyed by priceKey(item, vendor). */
  prices: Record<string, PriceSuggestion>;
  gstRates: number[];
  /** Why no PO can be numbered for this indent yet, or null. */
  blocked: string | null;
}) {
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.indent_line_id,
        {
          picked: true,
          quantity: String(line.left),
          vendorId: line.suggestion?.vendorId ?? "",
          rate: asText(line.suggestion?.rate),
          gst: asText(line.suggestion?.gstPct),
        },
      ]),
    ),
  );
  const [everyVendor, setEveryVendor] = useState("");
  const [error, setError] = useState<string>();
  const [creating, startCreating] = useTransition();

  const vendorOptions = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
    [vendors],
  );
  const vendorName = (id: string) => vendors.find((vendor) => vendor.id === id)?.name ?? "—";

  const update = (lineId: string, patch: Partial<Row>) =>
    setRows((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }));

  /** A new vendor brings their own last price for the item, when there is one. */
  const withVendor = (line: IndentOrderLine, row: Row, vendorId: string): Row => {
    const price = vendorId ? prices[priceKey(line.item_id, vendorId)] : undefined;
    return price
      ? { ...row, vendorId, rate: asText(price.rate), gst: asText(price.gstPct) }
      : { ...row, vendorId };
  };

  const setVendor = (line: IndentOrderLine, vendorId: string) =>
    setRows((current) => ({
      ...current,
      [line.indent_line_id]: withVendor(line, current[line.indent_line_id], vendorId),
    }));

  const applyToEvery = (vendorId: string) => {
    setEveryVendor(vendorId);
    if (!vendorId) return;
    setRows((current) =>
      Object.fromEntries(
        lines.map((line) => {
          const row = current[line.indent_line_id];
          return [line.indent_line_id, row.picked ? withVendor(line, row, vendorId) : row];
        }),
      ),
    );
  };

  const picks: IndentPick[] = lines
    .filter((line) => rows[line.indent_line_id].picked)
    .map((line) => {
      const row = rows[line.indent_line_id];
      return {
        indentLineId: line.indent_line_id,
        quantity: Number(row.quantity),
        vendorId: row.vendorId,
        rate: typed(row.rate),
        gstPct: typed(row.gst),
      };
    });
  const left = new Map(lines.map((line) => [line.indent_line_id, line.left]));
  const problem = blocked ?? picksProblem(picks, left);
  const groups = splitByVendor(picks.filter((pick) => pick.vendorId));

  const create = () =>
    startCreating(async () => {
      setError(undefined);
      // A success lands on the first PO; only a refusal comes back.
      const result = await createPosFromIndent(indentId, picks);
      if (result?.error) setError(result.error);
    });

  return (
    <div className="space-y-4 pb-28">
      {blocked && (
        <div className="border-warning/40 bg-warning/5 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">{blocked}</p>
        </div>
      )}

      <div className="border-border bg-surface max-w-md space-y-1.5 rounded-2xl border p-4">
        <Label htmlFor="every-vendor">One vendor for every ticked line</Label>
        <SearchSelect
          id="every-vendor"
          options={vendorOptions}
          value={everyVendor}
          onChange={applyToEvery}
          placeholder="Type a vendor's name…"
          emptyHint="Or pick a vendor on each line below."
        />
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-10"></TableHeaderCell>
            <TableHeaderCell className="w-14"></TableHeaderCell>
            <TableHeaderCell className="min-w-48">Material</TableHeaderCell>
            <TableHeaderCell className="w-32">Order</TableHeaderCell>
            <TableHeaderCell className="min-w-56">Vendor</TableHeaderCell>
            <TableHeaderCell className="w-32">Rate</TableHeaderCell>
            <TableHeaderCell className="w-28">GST</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((line) => {
            const row = rows[line.indent_line_id];
            const quantity = Number(row.quantity);
            const tooMuch = row.picked && quantity > line.left + 1e-9;
            const lastPrice = row.vendorId
              ? prices[priceKey(line.item_id, row.vendorId)]
              : undefined;
            return (
              <TableRow
                key={line.indent_line_id}
                className={row.picked ? "align-top" : "align-top opacity-60"}
              >
                <TableCell>
                  <Checkbox
                    checked={row.picked}
                    onChange={(event) =>
                      update(line.indent_line_id, { picked: event.target.checked })
                    }
                    aria-label={`Order ${line.item_name}`}
                  />
                </TableCell>
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
                    {[line.item_code, line.item_brand].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div className="text-muted text-xs">
                    {`${formatQuantity(line.left)} ${line.uom} left of ${formatQuantity(line.approved_quantity)}`}
                    {line.already_ordered > 0 &&
                      ` · ${formatQuantity(line.already_ordered)} already ordered`}
                  </div>
                  {line.note && <div className="text-muted text-xs">Note: {line.note}</div>}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    max={line.left}
                    value={row.quantity}
                    disabled={!row.picked}
                    onChange={(event) =>
                      update(line.indent_line_id, { quantity: event.target.value })
                    }
                    className="h-9 min-w-20"
                    aria-label={`Quantity to order for ${line.item_name}`}
                  />
                  <p className="text-muted mt-1 text-xs">{line.uom}</p>
                  {tooMuch && (
                    <p className="text-warning mt-1 text-xs font-medium">
                      {`Only ${formatQuantity(line.left)} ${line.uom} left`}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  {row.picked ? (
                    <SearchSelect
                      options={vendorOptions}
                      value={row.vendorId}
                      onChange={(vendorId) => setVendor(line, vendorId)}
                      placeholder="Type a vendor's name…"
                    />
                  ) : (
                    <span className="text-muted text-sm">{vendorName(row.vendorId)}</span>
                  )}
                  {row.picked && line.suggestion && row.vendorId === line.suggestion.vendorId && (
                    <p className="text-muted mt-1 text-xs">Bought from them last time</p>
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={row.rate}
                    disabled={!row.picked}
                    onChange={(event) => update(line.indent_line_id, { rate: event.target.value })}
                    placeholder="—"
                    className="h-9 min-w-20"
                    aria-label={`Rate for ${line.item_name}`}
                  />
                  <p className="text-muted mt-1 text-xs">
                    {lastPrice?.rate != null
                      ? `last paid ${formatMoney(lastPrice.rate, { paise: lastPrice.rate % 1 !== 0 })}`
                      : `per ${line.uom}`}
                  </p>
                </TableCell>
                <TableCell>
                  <Select
                    value={row.gst}
                    disabled={!row.picked}
                    onChange={(event) => update(line.indent_line_id, { gst: event.target.value })}
                    className="h-9 min-w-20 px-2.5"
                    aria-label={`GST for ${line.item_name}`}
                  >
                    <option value="">—</option>
                    {[...new Set([...gstRates, ...(row.gst ? [Number(row.gst)] : [])])]
                      .sort((a, b) => a - b)
                      .map((slab) => (
                        <option key={slab} value={String(slab)}>
                          {slab}%
                        </option>
                      ))}
                  </Select>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <p className="text-muted text-xs">
        Rates and GST can be left blank and priced on the draft POs. Discounts, other charges and
        the expected date are set there too.
      </p>

      {/* Nothing has been written yet — this bar is the commit point. */}
      <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-5 py-3 md:rounded-t-2xl md:border">
        <div className="min-w-0">
          {picks.length === 0 ? (
            <p className="text-muted text-sm">Tick the lines to order.</p>
          ) : (
            <p className="text-foreground text-sm font-medium">
              {`${formatCount(picks.length)} ${picks.length === 1 ? "line" : "lines"} → ${formatCount(groups.length)} draft ${groups.length === 1 ? "PO" : "POs"}`}
              {groups.length > 0 && (
                <span className="text-muted font-normal">
                  {` · ${groups.map((group) => `${vendorName(group.vendorId)} (${group.lines.length})`).join(", ")}`}
                </span>
              )}
            </p>
          )}
          <FormMessage error={error ?? (picks.length > 0 ? problem : undefined)} size="xs" />
        </div>
        <Button onClick={create} disabled={creating || Boolean(problem)}>
          {creating
            ? "Making the POs…"
            : groups.length > 1
              ? `Create ${groups.length} draft POs`
              : "Create the draft PO"}
        </Button>
      </div>
    </div>
  );
}
