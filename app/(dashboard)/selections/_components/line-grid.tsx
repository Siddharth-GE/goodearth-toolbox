"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { removeLine, updateLine } from "@/lib/selections/actions";
import type { SelectionLineRow } from "@/lib/selections/queries";
import { PackageOpen, Trash2 } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";

const inr = new Intl.NumberFormat("en-IN");

export function LineGrid({
  selectionId,
  lines,
  editable,
  emptyAction,
}: {
  selectionId: string;
  lines: SelectionLineRow[];
  editable: boolean;
  emptyAction?: ReactNode;
}) {
  if (lines.length === 0) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="Nothing specified here yet"
        description={
          editable
            ? "Use Add items to pick from the catalogue."
            : "No items were specified in this space."
        }
        action={emptyAction}
      />
    );
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell className="w-14"></TableHeaderCell>
          <TableHeaderCell>Item</TableHeaderCell>
          <TableHeaderCell className="w-28">Qty</TableHeaderCell>
          <TableHeaderCell className="w-20">Unit</TableHeaderCell>
          <TableHeaderCell>Note</TableHeaderCell>
          {editable && <TableHeaderCell className="w-12"></TableHeaderCell>}
        </TableRow>
      </TableHead>
      <TableBody>
        {lines.map((line) => (
          <LineRow key={line.id} selectionId={selectionId} line={line} editable={editable} />
        ))}
      </TableBody>
    </Table>
  );
}

function LineRow({
  selectionId,
  line,
  editable,
}: {
  selectionId: string;
  line: SelectionLineRow;
  editable: boolean;
}) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [note, setNote] = useState(line.designer_note ?? "");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  // Saves on blur rather than on every keystroke: a designer tabbing
  // through 30 rows shouldn't generate 300 writes.
  const save = () => {
    const parsed = Number(quantity);
    const unchanged = parsed === line.quantity && note === (line.designer_note ?? "");
    if (unchanged) return;
    if (!(parsed > 0)) {
      setError("Must be more than 0");
      setQuantity(String(line.quantity));
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await updateLine(selectionId, line.id, parsed, line.uom, note || null);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <TableRow className={pending ? "opacity-60" : undefined}>
      <TableCell>
        <ItemThumb code={line.item_code} name={line.item_name} thumbUrl={line.item_thumb_url} sizes="48px" className="w-10" />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{line.item_name}</span>
          {line.item_is_provisional && <Badge variant="warning">Provisional</Badge>}
        </div>
        <div className="text-xs text-muted">
          {line.item_code ?? "—"}
          {/* The snapshot is shown, never editable: what it cost when it was
              specified is Budgets' input, not a designer's decision. */}
          {line.indicative_rate_snapshot != null && (
            <span className="ml-2 opacity-60">indicative ₹{inr.format(line.indicative_rate_snapshot)}</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {editable ? (
          <Input
            type="number"
            step="any"
            min="0"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="h-9"
            aria-label={`Quantity for ${line.item_name}`}
          />
        ) : (
          inr.format(line.quantity)
        )}
        {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
      </TableCell>
      <TableCell className="text-muted">{line.uom}</TableCell>
      <TableCell>
        {editable ? (
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={save}
            placeholder="—"
            className="h-9"
            aria-label={`Note for ${line.item_name}`}
          />
        ) : (
          (line.designer_note ?? "—")
        )}
      </TableCell>
      {editable && (
        <TableCell>
          <button
            type="button"
            aria-label={`Remove ${line.item_name}`}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() =>
              startTransition(async () => {
                const result = await removeLine(selectionId, line.id);
                if (result?.error) setError(result.error);
              })
            }
          >
            <Trash2 className="size-4" />
          </button>
        </TableCell>
      )}
    </TableRow>
  );
}
