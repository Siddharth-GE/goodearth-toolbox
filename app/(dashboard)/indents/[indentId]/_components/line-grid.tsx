"use client";

import { CataloguePickerDialog } from "@/components/masters/catalogue-picker";
import { ItemThumb } from "@/components/masters/item-thumb";
import { Attribution } from "@/components/ui/attribution";
import { Badge } from "@/components/ui/badge";
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
import { formatCount, formatQuantity } from "@/lib/format";
import { addDirectLines, removeLine, updateLine } from "@/lib/indents/actions";
import type { IndentLineRow, IndentLineSource } from "@/lib/indents/queries";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { Calculator, PackageOpen, Palette, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

type Option = { id: string; name: string };

/** Where a pulled line came from, said under the item. Direct lines say
 * nothing — that's the default, not an event. */
const SOURCE_LABELS: Record<IndentLineSource, string | null> = {
  direct: null,
  construction: "from the construction plan",
  interiors: "from the interiors budget",
  estimate: "from the official estimate",
};

export function LineGrid({
  indentId,
  reference,
  lines,
  editable,
  hasUnit,
  showOrdered,
  categories,
  brands,
  uoms,
}: {
  indentId: string;
  reference: string;
  lines: IndentLineRow[];
  editable: boolean;
  /** The construction plan belongs to a unit, so that pull only makes
   * sense once the indent names one. */
  hasUnit: boolean;
  /** Approved indents show "ordered X of Y" per line — POs consume them. */
  showOrdered: boolean;
  categories: Option[];
  brands: Option[];
  /** Active unit names from the one master (0082). */
  uoms: string[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

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
              {/* The three sources a line can come from, in the order a
                  site team reaches for them. Construction requests come
                  from the official estimate since 2026-08-20; the old
                  plan pull is retired. */}
              {hasUnit && (
                <LinkButton
                  href={`/indents/${indentId}/pull-estimate`}
                  size="sm"
                  variant="secondary"
                >
                  <Calculator className="size-4" />
                  From the estimate
                </LinkButton>
              )}
              <LinkButton
                href={`/indents/${indentId}/pull-interiors`}
                size="sm"
                variant="secondary"
              >
                <Palette className="size-4" />
                From interiors budget
              </LinkButton>
              <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
                Add items
              </Button>
            </>
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Nothing requested yet"
          description={
            editable ? "Add items from the catalogue. Nothing is sent until you submit." : undefined
          }
          action={
            editable ? <Button onClick={() => setPickerOpen(true)}>Add items</Button> : undefined
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-14"></TableHeaderCell>
              <TableHeaderCell>Item</TableHeaderCell>
              <TableHeaderCell className="w-28">Qty</TableHeaderCell>
              <TableHeaderCell className="w-28">Unit</TableHeaderCell>
              {showOrdered && <TableHeaderCell className="w-36">Ordered</TableHeaderCell>}
              <TableHeaderCell>Note</TableHeaderCell>
              <TableHeaderCell className="w-12">By</TableHeaderCell>
              {editable && <TableHeaderCell className="w-12"></TableHeaderCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line) => (
              // Keyed on quantity too: the picker can raise an existing
              // line's quantity server-side, and a remount is the honest
              // way to show it — the row's own edits never revalidate, so
              // this can't steal focus mid-typing.
              <LineRow
                key={`${line.id}-${line.quantity}`}
                indentId={indentId}
                line={line}
                editable={editable}
                showOrdered={showOrdered}
                uoms={uoms}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {editable && (
        <CataloguePickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Add items"
          targetLabel={`indent ${reference}`}
          categories={categories}
          brands={brands}
          onCommit={(picked) =>
            addDirectLines(
              indentId,
              picked.map((entry) => ({ itemId: entry.item.id, quantity: entry.quantity })),
            )
          }
        />
      )}
    </div>
  );
}

function LineRow({
  indentId,
  line,
  editable,
  showOrdered,
  uoms,
}: {
  indentId: string;
  line: IndentLineRow;
  editable: boolean;
  showOrdered: boolean;
  uoms: string[];
}) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [uom, setUom] = useState(line.uom);
  const [note, setNote] = useState(line.note ?? "");
  const [removing, startTransition] = useTransition();

  const { flush, error, setError, saved } = useSaveOnBlur({
    initial: { quantity: line.quantity, uom: line.uom, note: line.note ?? "" },
    validate: ({ quantity: value }) =>
      Number.isFinite(value) && value > 0 ? undefined : "Quantity must be more than 0",
    save: ({ quantity: value, uom: unit, note: text }) =>
      updateLine(line.id, { quantity: value, uom: unit, note: text || null }),
  });

  const save = (nextUom = uom) => {
    const parsed = Number(quantity.trim());
    if (!Number.isFinite(parsed) || !(parsed > 0)) {
      setQuantity(String(line.quantity));
    }
    flush({ quantity: parsed, uom: nextUom, note });
  };

  const sourceLabel = SOURCE_LABELS[line.source];

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
          {sourceLabel && <span className="ml-2 italic">{sourceLabel}</span>}
        </div>
        {line.design_drift && (
          // A revision issued after this line was pulled changed or
          // removed it — the order may need revisiting.
          <div className="mt-1">
            <Badge variant="warning">
              {line.design_drift === "removed"
                ? "Removed from the design since this was requested"
                : "Design changed since this was requested"}
            </Badge>
          </div>
        )}
      </TableCell>
      {editable ? (
        <>
          <TableCell>
            <Input
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              onBlur={() => save()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="h-9"
              aria-label={`Quantity for ${line.item_name}`}
            />
            <FormMessage
              error={error}
              success={saved ? "Saved" : undefined}
              size="xs"
              className="mt-1"
            />
          </TableCell>
          <TableCell>
            {/* Saved immediately on change — a select has no meaningful
                blur, and waiting for one loses the edit on remove/submit. */}
            <Select
              value={uom}
              onChange={(event) => {
                setUom(event.target.value);
                save(event.target.value);
              }}
              className="h-9"
              aria-label={`Unit for ${line.item_name}`}
            >
              {/* A saved unit that has since left the master stays
                  choosable, so an old line can be reopened and saved. */}
              {uom && !uoms.includes(uom) && <option value={uom}>{uom}</option>}
              {uoms.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </TableCell>
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
                  const result = await removeLine(indentId, line.id);
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
          <TableCell>{formatQuantity(line.quantity)}</TableCell>
          <TableCell className="text-muted">{line.uom}</TableCell>
          {showOrdered && (
            <TableCell>
              {line.ordered_quantity > 0 ? (
                <>
                  <span
                    className={
                      line.ordered_quantity >= line.quantity
                        ? "text-success font-medium"
                        : "text-foreground"
                    }
                  >
                    {formatQuantity(line.ordered_quantity)} of {formatQuantity(line.quantity)}
                  </span>
                  {line.ordered_po_refs && (
                    <div className="text-muted text-xs">{line.ordered_po_refs}</div>
                  )}
                </>
              ) : (
                <span className="text-muted">not yet</span>
              )}
            </TableCell>
          )}
          <TableCell className="text-muted">{line.note ?? "—"}</TableCell>
          <TableCell>
            <Attribution name={line.updated_by_name} label="Last edited by" />
          </TableCell>
        </>
      )}
    </TableRow>
  );
}
