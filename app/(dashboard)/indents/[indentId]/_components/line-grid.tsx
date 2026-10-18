"use client";

import { Heading } from "@/components/ui/heading";
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
import { formatCount, formatDate, formatQuantity } from "@/lib/format";
import { parseNumber } from "@/lib/form-data";
import { addDirectLines, removeLine, updateLine } from "@/lib/indents/actions";
import type { IndentLineRow, IndentLineSource } from "@/lib/indents/detail-queries";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { stillToBuy, waitsForEstimator } from "@/lib/indents/workflow";
import { Calculator, PackageOpen, Palette, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

type Option = { id: string; name: string };

/** Where a pulled line came from; direct lines say nothing. */
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
  hasUnit: boolean;
  showOrdered: boolean;
  categories: Option[];
  brands: Option[];
  uoms: string[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading>Lines</Heading>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted text-xs">
            {formatCount(lines.length)} {lines.length === 1 ? "line" : "lines"}
          </span>
          {editable && (
            <>
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
            editable
              ? "Add items from the catalogue — anything the estimate does not list needs a reason and the estimator's yes. Nothing is sent until you submit."
              : undefined
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
              {showOrdered && <TableHeaderCell className="w-24">To buy</TableHeaderCell>}
              <TableHeaderCell>Note</TableHeaderCell>
              <TableHeaderCell className="w-12">By</TableHeaderCell>
              {editable && <TableHeaderCell className="w-12"></TableHeaderCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line) => (
              // Keyed on quantity: the picker can raise it server-side, and a remount shows that without stealing focus.
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

/** A line saved in another unit before the Masters-unit rule says so: its next save switches unit and the quantity must be re-typed. */
function UnitText({ line }: { line: IndentLineRow }) {
  const master = line.item_default_uom;
  const differs = master != null && master.trim().toLowerCase() !== line.uom.trim().toLowerCase();
  return (
    <div>
      <span className="text-muted text-sm">{line.uom}</span>
      {differs && (
        <div className="mt-1">
          <Badge variant="warning">
            Masters says {master} — re-enter the quantity in {master}
          </Badge>
        </div>
      )}
    </div>
  );
}

/** A draft shows only an answer kept from before a send-back; changing the line empties it. */
function EstimatorAnswer({ line, draft }: { line: IndentLineRow; draft: boolean }) {
  const answer = line.estimator;
  if (!answer) {
    return draft ? null : <Badge variant="neutral">Waiting for the estimator</Badge>;
  }
  const by = [answer.by_name, formatDate(answer.at)].filter(Boolean).join(" · ");
  return answer.decision === "approved" ? (
    <p className="text-xs">
      <Badge variant="success">Estimator approved</Badge>
      <span className="text-muted ml-2">{by}</span>
    </p>
  ) : (
    <div className="space-y-0.5 text-xs">
      <p>
        <Badge variant="danger">Estimator refused</Badge>
        <span className="text-muted ml-2">{by}</span>
      </p>
      {answer.note && <p className="text-foreground">{answer.note}</p>}
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
  const [reason, setReason] = useState(line.off_estimate_reason ?? "");
  const [removing, startTransition] = useTransition();

  const { flush, error, setError, saved } = useSaveOnBlur({
    initial: {
      quantity: line.quantity,
      uom: line.uom,
      note: line.note ?? "",
      reason: line.off_estimate_reason ?? "",
    },
    validate: ({ quantity: value }) =>
      Number.isFinite(value) && value > 0 ? undefined : "Quantity must be more than 0",
    save: ({ quantity: value, uom: unit, note: text, reason: why }) =>
      updateLine(line.id, {
        quantity: value,
        uom: unit,
        note: text || null,
        reason: why.trim() || null,
      }),
  });

  const save = (nextUom = uom) => {
    const parsed = parseNumber(quantity) ?? 0;
    if (!Number.isFinite(parsed) || !(parsed > 0)) {
      setQuantity(String(line.quantity));
    }
    flush({ quantity: parsed, uom: nextUom, note, reason });
  };

  const sourceLabel = SOURCE_LABELS[line.source];
  const outside = waitsForEstimator(line.source);

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
          <div className="mt-1">
            <Badge variant="warning">
              {line.design_drift === "removed"
                ? "Removed from the design since this was requested"
                : "Design changed since this was requested"}
            </Badge>
          </div>
        )}
        {outside && (
          // Outside the estimate (0113): says why, waits for the estimator.
          <div className="mt-1.5 space-y-1">
            <Badge variant="warning">Outside the estimate</Badge>
            {editable ? (
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                onBlur={() => save()}
                placeholder="Why is it needed?"
                maxLength={500}
                className="h-9"
                aria-label={`Why ${line.item_name} is needed`}
              />
            ) : (
              <p className="text-foreground text-xs">
                <span className="text-muted">Why: </span>
                {line.off_estimate_reason ?? "—"}
              </p>
            )}
            <EstimatorAnswer line={line} draft={editable} />
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
            {line.source === "interiors" ? (
              // Saved on change: a select has no meaningful blur.
              <Select
                value={uom}
                onChange={(event) => {
                  setUom(event.target.value);
                  save(event.target.value);
                }}
                className="h-9"
                aria-label={`Unit for ${line.item_name}`}
              >
                {/* A saved unit that left the master stays choosable. */}
                {uom && !uoms.includes(uom) && <option value={uom}>{uom}</option>}
                {uoms.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            ) : (
              <UnitText line={line} />
            )}
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
          <TableCell className="text-muted">
            {line.source === "interiors" ? line.uom : <UnitText line={line} />}
          </TableCell>
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
          {showOrdered && (
            <TableCell>
              {stillToBuy(line.quantity, line.ordered_quantity) > 0 ? (
                <span className="text-foreground font-medium">
                  {formatQuantity(stillToBuy(line.quantity, line.ordered_quantity))}
                </span>
              ) : (
                <span className="text-muted">—</span>
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
