"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatQuantity } from "@/lib/format";
import { addEstimatePullLines } from "@/lib/indents/actions";
import type { EstimatePullRow } from "@/lib/indents/queries";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

/**
 * The estimate pull: the official estimate's material takeoff, one row
 * per catalogue item, a local basket and one commit — the PullBasket
 * idea. A ready row prefills the estimate's figure; a needs-quantity row
 * (an estimate from before materials were items) shows the estimate's
 * figure and asks a person for the procurement quantity; an unlinked row
 * cannot be picked and says why.
 */
export function EstimatePullBasket({
  indentId,
  estimateId,
  reference,
  rows,
}: {
  indentId: string;
  estimateId: string;
  /** The indent's reference, for the commit bar. */
  reference: string;
  rows: EstimatePullRow[];
}) {
  const router = useRouter();
  // "" = ticked but no quantity typed yet (a needs_qty row).
  const [picked, setPicked] = useState<Record<string, number | "">>({});
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const pickedEntries = useMemo(() => Object.entries(picked), [picked]);
  const missingQty = pickedEntries.some(([, qty]) => qty === "" || qty <= 0);

  const toggle = (row: EstimatePullRow, on: boolean) =>
    setPicked((current) => {
      const next = { ...current };
      if (!row.item_id) return current;
      if (on) next[row.item_id] = row.prefill_qty ?? "";
      else delete next[row.item_id];
      return next;
    });

  const setQuantity = (itemId: string, raw: string) =>
    setPicked((current) => ({
      ...current,
      [itemId]: raw === "" ? "" : Number(raw),
    }));

  const commit = () =>
    startSaving(async () => {
      const lines = pickedEntries
        .filter((entry): entry is [string, number] => entry[1] !== "" && entry[1] > 0)
        .map(([itemId, quantity]) => ({ itemId, quantity }));
      const result = await addEstimatePullLines(indentId, estimateId, lines);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`/indents/${indentId}`);
    });

  return (
    <div className="space-y-3">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell></TableHeaderCell>
            <TableHeaderCell>Material</TableHeaderCell>
            <TableHeaderCell>Estimate says</TableHeaderCell>
            <TableHeaderCell>Already requested</TableHeaderCell>
            <TableHeaderCell>Request now</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const on = row.item_id !== null && row.item_id in picked;
            const disabled = row.item_id === null || row.on_this_indent;
            const name = row.item_name ?? row.estimate_name;
            const itemId = row.item_id;
            return (
              <TableRow key={row.key}>
                <TableCell>
                  <Checkbox
                    checked={on}
                    disabled={disabled}
                    onChange={(event) => toggle(row, event.target.checked)}
                    aria-label={`Pick ${name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {row.item_id && (
                      <ItemThumb
                        code={row.item_code}
                        name={name}
                        thumbUrl={row.item_thumb_url}
                        sizes="48px"
                        className="w-10 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-medium">{name}</p>
                      <p className="text-muted truncate text-xs">
                        {row.item_code ? `${row.item_code} · ` : ""}
                        {row.estimate_name !== name && `${row.estimate_name} · `}
                        {row.work_count === 1 ? "1 work" : `${row.work_count} works`}
                      </p>
                      {row.state === "unlinked" && (
                        <p className="text-warning text-xs">
                          Not linked to a catalogue item — this estimate is from before materials
                          were items. A newer official estimate will list it properly.
                        </p>
                      )}
                      {row.on_this_indent && (
                        <p className="text-muted text-xs">Already on this indent.</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {row.estimate_parts
                    .map((part) => `${formatQuantity(part.quantity)} ${part.uom}`)
                    .join(" + ")}
                  {row.state === "ready" &&
                    row.prefill_qty !== null &&
                    row.item_default_uom &&
                    !isAsBought(row) && (
                      <span className="text-muted">
                        {" "}
                        ≈ {formatQuantity(row.prefill_qty)} {row.item_default_uom}
                      </span>
                    )}
                  {row.state === "needs_qty" && (
                    <span className="text-muted block text-xs">
                      bought in {row.item_default_uom} — no conversion set, type the quantity
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {row.already_requested > 0 ? (
                    <>
                      {formatQuantity(row.already_requested)} {row.item_default_uom}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {on && itemId ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={picked[itemId]}
                        onChange={(event) => setQuantity(itemId, event.target.value)}
                        className="w-24"
                        aria-label={`Quantity of ${name}`}
                      />
                      <span className="text-muted text-sm">{row.item_default_uom}</span>
                    </div>
                  ) : (
                    <span className="text-muted text-sm">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="border-border bg-surface-raised sticky bottom-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 shadow-sm">
        <p className="text-muted text-sm">
          {pickedEntries.length === 0
            ? "Tick the materials to request — nothing is added until you press Add."
            : `${formatCount(pickedEntries.length)} ${pickedEntries.length === 1 ? "material" : "materials"} picked for ${reference}.`}
          {missingQty && pickedEntries.length > 0 && (
            <span className="text-warning"> Every picked row needs a quantity above 0.</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <FormMessage error={error} />
          <Button onClick={commit} disabled={saving || pickedEntries.length === 0 || missingQty}>
            {saving ? "Adding…" : "Add to the indent"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** True when the estimate's figure is already the item's own unit and
 * quantity — nothing to convert, so no "≈" hint beside it. */
function isAsBought(row: EstimatePullRow): boolean {
  const [only, ...rest] = row.estimate_parts;
  return (
    rest.length === 0 &&
    only !== undefined &&
    only.uom.trim().toLowerCase() === row.item_default_uom?.trim().toLowerCase() &&
    only.quantity === row.prefill_qty
  );
}
