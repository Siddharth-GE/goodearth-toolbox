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
 * per material, a local basket and one commit — the PullBasket idea,
 * reshaped for rows that carry their own conversion story. A ready row
 * prefills the converted figure; a needs-quantity row shows the
 * estimate figure and asks a person for the procurement quantity; an
 * unlinked row cannot be picked and says where the fix lives.
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
      if (on) next[row.material_id] = row.prefill_qty ?? "";
      else delete next[row.material_id];
      return next;
    });

  const setQuantity = (materialId: string, raw: string) =>
    setPicked((current) => ({
      ...current,
      [materialId]: raw === "" ? "" : Number(raw),
    }));

  const commit = () =>
    startSaving(async () => {
      const lines = pickedEntries
        .filter((entry): entry is [string, number] => entry[1] !== "" && entry[1] > 0)
        .map(([materialId, quantity]) => ({ materialId, quantity }));
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
            const on = row.material_id in picked;
            const disabled = row.state === "unlinked" || row.on_this_indent;
            return (
              <TableRow key={row.material_id}>
                <TableCell>
                  <Checkbox
                    checked={on}
                    disabled={disabled}
                    onChange={(event) => toggle(row, event.target.checked)}
                    aria-label={`Pick ${row.material_name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {row.item_id && (
                      <ItemThumb
                        code={row.item_code}
                        name={row.item_name ?? row.material_name}
                        thumbUrl={row.item_thumb_url}
                        sizes="48px"
                        className="w-10 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-medium">
                        {row.item_name ?? row.material_name}
                      </p>
                      <p className="text-muted truncate text-xs">
                        {row.item_code ? `${row.item_code} · ` : ""}
                        {row.material_name}
                        {" · "}
                        {row.work_count === 1 ? "1 work" : `${row.work_count} works`}
                      </p>
                      {row.state === "unlinked" && (
                        <p className="text-warning text-xs">
                          Not linked to a catalogue item — link it on the Estimator&apos;s Materials
                          screen first.
                        </p>
                      )}
                      {row.on_this_indent && (
                        <p className="text-muted text-xs">Already on this indent.</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatQuantity(row.estimate_quantity)} {row.material_uom}
                  {row.state === "ready" &&
                    row.prefill_qty !== null &&
                    row.item_default_uom &&
                    row.prefill_qty !== row.estimate_quantity && (
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
                  {on ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={picked[row.material_id]}
                        onChange={(event) => setQuantity(row.material_id, event.target.value)}
                        className="w-24"
                        aria-label={`Quantity of ${row.material_name}`}
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
