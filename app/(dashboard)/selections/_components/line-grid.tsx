"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { removeLine, updateLine } from "@/lib/selections/actions";
import type { SelectionLineRow } from "@/lib/selections/queries";
import { PackageOpen, Trash2 } from "lucide-react";
import { type ReactNode, useRef, useState, useTransition } from "react";

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
  const [removing, startTransition] = useTransition();
  // What's actually persisted, so a second blur without a change doesn't
  // fire another write.
  const saved = useRef({ quantity: line.quantity, note: line.designer_note ?? "" });

  // Saves on blur rather than on every keystroke: a designer tabbing
  // through 30 rows shouldn't generate 300 writes. Fired outside a
  // transition so it doesn't mark the row busy — the value is already on
  // screen and updateLine deliberately doesn't revalidate the page.
  const save = () => {
    const parsed = Number(quantity.trim());
    if (parsed === saved.current.quantity && note === saved.current.note) return;
    if (!Number.isFinite(parsed) || !(parsed > 0)) {
      setError("Quantity must be more than 0");
      setQuantity(String(saved.current.quantity));
      return;
    }
    setError(undefined);
    saved.current = { quantity: parsed, note };
    void updateLine(selectionId, line.id, parsed, line.uom, note || null).then((result) => {
      if (result?.error) {
        setError(result.error);
        // It didn't persist, so the next blur has to try again. Without
        // this the row is marked saved before the write is known to have
        // worked, and the short-circuit above then blocks every retry —
        // the designer's edit is silently lost. The pricing and margins
        // grids already roll back this way.
        saved.current = { quantity: NaN, note: "" };
      }
    });
  };

  // Deliberately no pending/dimmed state on save: the input already shows
  // what the designer typed, and flashing the row on every tab-out makes a
  // fast edit feel slow. Only a failure is worth interrupting for.
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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-foreground font-medium">{line.item_name}</span>
          {line.item_is_provisional && <Badge variant="warning">Provisional</Badge>}
        </div>
        <div className="text-muted text-xs">
          {line.item_code ?? "—"}
          {/* The snapshot is shown, never editable: what it cost when it was
              specified is Budgets' input, not a designer's decision. */}
          {line.indicative_rate_snapshot != null && (
            <span className="ml-2 opacity-60">
              indicative ₹{inr.format(line.indicative_rate_snapshot)}
            </span>
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
        {error && <p className="text-danger mt-1 text-xs font-medium">{error}</p>}
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
            // Dimming the row isn't enough on its own: the button stayed
            // clickable, so a double-click fired removeLine twice.
            disabled={removing}
            className="text-muted hover:bg-danger/10 hover:text-danger focus-visible:ring-accent rounded-lg p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
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
