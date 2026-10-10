"use client";

import { Button } from "@/components/ui/button";
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
import {
  leftToBill,
  lineMoneyOf,
  linesFromPo,
  linesFromWorkOrder,
  type BillLineDraft,
  type PoLineForBill,
  type WorkOrderLineForBill,
} from "@/lib/bills/lines";
import { billLineMoney, rollUpBill } from "@/lib/bills/math";
import { formatCount, formatMoney } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";

/**
 * A bill's lines being written: quantity × rate, less a rupee discount,
 * GST on that, other charges after it — each line's amount and the
 * bill's totals worked out as figures are typed, the way the database
 * will store them. Controlled: the bill page saves, the new-bill form
 * records.
 */

/** A line in the editor: the draft, its saved id, and its typed text. */
export type EditorLine = {
  key: string;
  id?: string;
  draft: BillLineDraft;
  text: { quantity: string; rate: string; discount: string; charges: string };
};

let nextKey = 0;
export function toEditorLine(draft: BillLineDraft, id?: string): EditorLine {
  const show = (value: number | null) => (value === null ? "" : String(value));
  return {
    key: `b${nextKey++}`,
    id,
    draft,
    text: {
      quantity: show(draft.quantity),
      rate: show(draft.rate),
      discount: show(draft.discountAmount),
      charges: show(draft.otherCharges),
    },
  };
}

const typed = (text: string) => (text.trim() === "" ? null : Number(text.trim()));

/** The editor's lines as drafts, typed text read as numbers. */
export function draftsOf(lines: EditorLine[]): (BillLineDraft & { id?: string })[] {
  return lines.map((line) => ({
    ...line.draft,
    id: line.id,
    quantity: line.draft.kind === "pw_lump" ? null : typed(line.text.quantity),
    rate: typed(line.text.rate),
    discountAmount: typed(line.text.discount),
    otherCharges: typed(line.text.charges),
  }));
}

const KIND_LABEL: Record<BillLineDraft["kind"], string> = {
  material: "Material",
  nmr: "Daily wages",
  pw_qty: "Piece-work",
  pw_lump: "Lump sum",
  other: "Other",
};

const blankOther = (): BillLineDraft => ({
  kind: "other",
  poLineId: null,
  itemId: null,
  labourLogId: null,
  workItemId: null,
  description: "",
  uom: null,
  quantity: 1,
  rate: null,
  gstPct: 0,
  discountAmount: null,
  otherCharges: null,
  note: null,
});

export function BillLinesEditor({
  lines,
  onChange,
  gstRates,
  uoms,
  poLines,
  workLines,
  allowOther,
  lockedQuantities = false,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  gstRates: number[];
  uoms: string[];
  /** A PO bill: the PO's lines, to add what is still to bill. */
  poLines?: PoLineForBill[];
  /** A work-order bill: its works, to add as lines. */
  workLines?: WorkOrderLineForBill[];
  /** Lines that are neither the PO's materials nor labour (not on a PO bill). */
  allowOther: boolean;
  /** A bill made from labour entries: lines and quantities come from them. */
  lockedQuantities?: boolean;
}) {
  const drafts = draftsOf(lines);
  const totals = rollUpBill(drafts.map(lineMoneyOf));

  const update = (key: string, patch: Partial<EditorLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const updateDraft = (line: EditorLine, patch: Partial<BillLineDraft>) =>
    update(line.key, { draft: { ...line.draft, ...patch } });
  const updateText = (line: EditorLine, patch: Partial<EditorLine["text"]>) =>
    update(line.key, { text: { ...line.text, ...patch } });

  // PO lines not on this bill yet, with something received and unbilled.
  const onBill = new Set(
    lines.flatMap((line) => (line.draft.poLineId ? [line.draft.poLineId] : [])),
  );
  const poToAdd = (poLines ?? []).filter(
    (line) => !onBill.has(line.po_line_id) && leftToBill(line) > 0,
  );

  return (
    <div className="space-y-3">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="min-w-56 px-3">Line</TableHeaderCell>
            <TableHeaderCell className="w-28 px-3">Quantity</TableHeaderCell>
            <TableHeaderCell className="w-28 px-3">Rate</TableHeaderCell>
            <TableHeaderCell className="w-24 px-3">GST</TableHeaderCell>
            <TableHeaderCell className="w-28 px-3">Discount ₹</TableHeaderCell>
            <TableHeaderCell className="w-28 px-3">Other ₹</TableHeaderCell>
            <TableHeaderCell className="w-32 px-3">Amount</TableHeaderCell>
            {!lockedQuantities && <TableHeaderCell className="w-12 px-3"></TableHeaderCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((line, index) => {
            const draft = drafts[index];
            const money = billLineMoney(lineMoneyOf(draft));
            const lump = line.draft.kind === "pw_lump";
            const freeUnit = line.draft.kind === "other";
            return (
              <TableRow key={line.key} className="align-top">
                <TableCell className="space-y-1.5 px-3">
                  {line.draft.kind === "material" || line.draft.labourLogId || lockedQuantities ? (
                    <p className="text-foreground text-sm font-medium">{line.draft.description}</p>
                  ) : (
                    <Input
                      value={line.draft.description}
                      onChange={(event) => updateDraft(line, { description: event.target.value })}
                      placeholder="What this line is for"
                      className="h-9"
                      aria-label="Description"
                    />
                  )}
                  <p className="text-muted text-xs">{KIND_LABEL[line.draft.kind]}</p>
                </TableCell>
                <TableCell className="px-3">
                  {lump ? (
                    <span className="text-muted text-sm">—</span>
                  ) : lockedQuantities ? (
                    <span className="text-sm whitespace-nowrap">{`${line.text.quantity} ${line.draft.uom ?? ""}`}</span>
                  ) : (
                    <>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={line.text.quantity}
                        onChange={(event) => updateText(line, { quantity: event.target.value })}
                        className="h-9 min-w-20"
                        aria-label={`Quantity for ${line.draft.description || "this line"}`}
                      />
                      {freeUnit ? (
                        <Select
                          value={line.draft.uom ?? ""}
                          onChange={(event) =>
                            updateDraft(line, { uom: event.target.value || null })
                          }
                          className="mt-1 h-8 px-2 text-xs"
                          aria-label="Unit"
                        >
                          <option value="">no unit</option>
                          {uoms.map((uom) => (
                            <option key={uom} value={uom}>
                              {uom}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <p className="text-muted mt-1 text-xs">{line.draft.uom ?? ""}</p>
                      )}
                    </>
                  )}
                </TableCell>
                <TableCell className="px-3">
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={line.text.rate}
                    onChange={(event) => updateText(line, { rate: event.target.value })}
                    placeholder="—"
                    className="h-9 min-w-20"
                    aria-label={lump ? "Lump sum amount" : "Rate"}
                  />
                  <p className="text-muted mt-1 text-xs">
                    {lump ? "the amount" : `per ${line.draft.uom || "unit"}`}
                  </p>
                </TableCell>
                <TableCell className="px-3">
                  <Select
                    value={String(line.draft.gstPct)}
                    onChange={(event) => updateDraft(line, { gstPct: Number(event.target.value) })}
                    className="h-9 min-w-20 px-2.5"
                    aria-label="GST"
                  >
                    {[...new Set([0, ...gstRates, line.draft.gstPct])]
                      .sort((a, b) => a - b)
                      .map((slab) => (
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
                    value={line.text.discount}
                    onChange={(event) => updateText(line, { discount: event.target.value })}
                    placeholder="—"
                    className="h-9 min-w-20"
                    aria-label="Discount in rupees"
                  />
                </TableCell>
                <TableCell className="px-3">
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={line.text.charges}
                    onChange={(event) => updateText(line, { charges: event.target.value })}
                    placeholder="—"
                    className="h-9 min-w-20"
                    aria-label="Other charges in rupees"
                  />
                </TableCell>
                <TableCell className="px-3 font-mono whitespace-nowrap">
                  {formatMoney(money?.total, { paise: true })}
                  {money && money.gst > 0 && (
                    <div className="text-muted mt-1 font-sans text-xs">{`incl. ${formatMoney(money.gst, { paise: true })} GST`}</div>
                  )}
                </TableCell>
                {!lockedQuantities && (
                  <TableCell className="px-3">
                    <IconButton
                      aria-label="Remove this line"
                      tone="danger"
                      onClick={() => onChange(lines.filter((other) => other.key !== line.key))}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-start justify-between gap-3">
        {!lockedQuantities ? (
          <div className="flex flex-wrap gap-2">
            {poToAdd.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  onChange([...lines, ...linesFromPo(poToAdd).map((draft) => toEditorLine(draft))])
                }
              >
                <Plus className="size-4" />
                {`Add the PO's ${formatCount(poToAdd.length)} ${poToAdd.length === 1 ? "material" : "materials"} still to bill`}
              </Button>
            )}
            {workLines && workLines.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  onChange([
                    ...lines,
                    ...linesFromWorkOrder(workLines).map((draft) => toEditorLine(draft)),
                  ])
                }
              >
                <Plus className="size-4" />
                Add the work order&apos;s works
              </Button>
            )}
            {allowOther && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onChange([...lines, toEditorLine(blankOther())])}
              >
                <Plus className="size-4" />
                Add a line
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted max-w-md text-xs">
            Made from labour entries: the lines and quantities come from them. The rates, GST and
            charges can change here.
          </p>
        )}

        <div className="border-border bg-surface w-full max-w-xs space-y-1 rounded-2xl border p-4">
          <Total label="Taxable" value={totals.taxable} />
          <Total label="GST" value={totals.gst} />
          {totals.other > 0 && <Total label="Other charges" value={totals.other} />}
          <div className="border-border flex items-center justify-between border-t pt-2">
            <span className="text-foreground text-sm font-semibold">Total</span>
            <span className="text-foreground text-sm font-semibold tabular-nums">
              {formatMoney(totals.total, { paise: true })}
            </span>
          </div>
          {totals.unpricedCount > 0 && (
            <p className="text-warning text-xs font-medium">
              {`${formatCount(totals.unpricedCount)} ${totals.unpricedCount === 1 ? "line has" : "lines have"} no rate yet.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted text-sm">{label}</span>
      <span className="text-foreground text-sm tabular-nums">
        {formatMoney(value, { paise: true })}
      </span>
    </div>
  );
}
