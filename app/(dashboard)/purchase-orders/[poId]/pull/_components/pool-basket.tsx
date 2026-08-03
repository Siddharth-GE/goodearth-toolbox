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
import { addPoolLines } from "@/lib/purchase-orders/actions";
import type { PoolIndentGroup } from "@/lib/purchase-orders/queries";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

/**
 * The PullBasket pattern (Indents M4), adapted for ordering: approved
 * indent lines laid out indent by indent, quantities prefilled with
 * what's still unordered, a local basket and one commit. Nothing is
 * written until Add. Lines already on this PO, and lines fully ordered
 * elsewhere, show disabled-and-labelled — never hidden.
 */
export function PoolBasket({
  poId,
  reference,
  groups,
}: {
  poId: string;
  reference: string;
  groups: PoolIndentGroup[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const pickedEntries = useMemo(() => Object.entries(picked), [picked]);

  const remainingById = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of groups)
      for (const line of group.lines) map.set(line.indent_line_id, line.remaining);
    return map;
  }, [groups]);

  const selectable = (line: PoolIndentGroup["lines"][number]) =>
    !line.on_this_po && line.remaining > 0;

  const toggle = (line: PoolIndentGroup["lines"][number], on: boolean) =>
    setPicked((current) => {
      const next = { ...current };
      if (on) next[line.indent_line_id] = line.remaining;
      else delete next[line.indent_line_id];
      return next;
    });

  const setQuantity = (indentLineId: string, quantity: number) =>
    setPicked((current) => ({ ...current, [indentLineId]: quantity }));

  const toggleGroup = (group: PoolIndentGroup, on: boolean) =>
    setPicked((current) => {
      const next = { ...current };
      for (const line of group.lines) {
        if (!selectable(line)) continue;
        if (on) next[line.indent_line_id] = line.remaining;
        else delete next[line.indent_line_id];
      }
      return next;
    });

  const overRemaining = pickedEntries.some(
    ([id, quantity]) => quantity > (remainingById.get(id) ?? 0),
  );

  const commit = () =>
    startSaving(async () => {
      const lines = pickedEntries.map(([indentLineId, quantity]) => ({ indentLineId, quantity }));
      const result = await addPoolLines(poId, lines);
      if (result?.error) {
        setError(result.error);
        // A partial add still changed the PO: drop what went in so a
        // second press can't ask for it twice.
        router.refresh();
        setPicked({});
        return;
      }
      router.push(`/purchase-orders/${poId}`);
    });

  return (
    <div className="space-y-6 pb-28">
      {groups.map((group) => {
        const available = group.lines.filter(selectable);
        const allPicked =
          available.length > 0 && available.every((line) => picked[line.indent_line_id] != null);
        return (
          <section key={group.indent_id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-foreground text-lg font-bold tracking-tight">
                {group.reference}
                {group.stage && <span className="text-muted ml-2 text-sm">· {group.stage}</span>}
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-muted text-xs">
                  {formatCount(group.lines.length)} {group.lines.length === 1 ? "line" : "lines"}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={available.length === 0}
                  onClick={() => toggleGroup(group, !allPicked)}
                >
                  {allPicked ? "Clear" : "Select this indent"}
                </Button>
              </div>
            </div>

            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="w-10"></TableHeaderCell>
                  <TableHeaderCell className="w-14"></TableHeaderCell>
                  <TableHeaderCell>Item</TableHeaderCell>
                  <TableHeaderCell className="w-28">Approved</TableHeaderCell>
                  <TableHeaderCell className="w-32">Already ordered</TableHeaderCell>
                  <TableHeaderCell className="w-32">Order</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {group.lines.map((line) => {
                  const chosen = picked[line.indent_line_id] != null;
                  const disabled = !selectable(line);
                  const tooMuch = chosen && (picked[line.indent_line_id] ?? 0) > line.remaining;
                  return (
                    <TableRow
                      key={line.indent_line_id}
                      className={disabled ? "opacity-60" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={chosen}
                          disabled={disabled}
                          onChange={(event) => toggle(line, event.target.checked)}
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
                          {line.item_code ?? "—"}
                          {line.item_brand && <span className="ml-2">{line.item_brand}</span>}
                          {line.on_this_po && (
                            <span className="text-accent ml-2 font-medium">already on this PO</span>
                          )}
                          {!line.on_this_po && line.remaining === 0 && (
                            <span className="text-muted ml-2 font-medium">fully ordered</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted">
                        {formatQuantity(line.approved_quantity)} {line.uom}
                      </TableCell>
                      <TableCell className="text-muted">
                        {line.already_ordered > 0
                          ? `${formatQuantity(line.already_ordered)} ${line.uom}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {chosen ? (
                          <>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              max={line.remaining}
                              value={String(picked[line.indent_line_id])}
                              onChange={(event) =>
                                setQuantity(line.indent_line_id, Number(event.target.value))
                              }
                              className="h-9"
                              aria-label={`Quantity to order for ${line.item_name}`}
                            />
                            {tooMuch && (
                              <p className="text-warning mt-1 text-xs font-medium">
                                Only {formatQuantity(line.remaining)} {line.uom} unordered
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-muted/50 text-sm">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        );
      })}

      {/* Nothing has been written yet — this bar is the commit point. */}
      <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-5 py-3 md:rounded-t-2xl md:border">
        <div className="min-w-0">
          {pickedEntries.length === 0 ? (
            <p className="text-muted text-sm">
              Tick the lines to order, or take a whole indent at once.
            </p>
          ) : (
            <p className="text-foreground text-sm font-medium">
              {pickedEntries.length} {pickedEntries.length === 1 ? "line" : "lines"} onto{" "}
              {reference}
            </p>
          )}
          <FormMessage error={error} size="xs" />
        </div>
        <div className="flex items-center gap-2">
          {pickedEntries.length > 0 && (
            <Button variant="ghost" onClick={() => setPicked({})} disabled={saving}>
              Clear
            </Button>
          )}
          <Button
            onClick={commit}
            disabled={
              saving ||
              pickedEntries.length === 0 ||
              overRemaining ||
              pickedEntries.some(([, quantity]) => !Number.isFinite(quantity) || quantity <= 0)
            }
          >
            {saving ? "Adding…" : "Add to purchase order"}
          </Button>
        </div>
      </div>
    </div>
  );
}
