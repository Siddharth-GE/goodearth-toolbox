"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { saveBillLines } from "@/lib/bills/line-actions";
import type { BillLineRow } from "@/lib/bills/line-queries";
import { billLinesProblem, type PoLineForBill, type WorkOrderLineForBill } from "@/lib/bills/lines";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BillLinesEditor,
  draftsOf,
  toEditorLine,
  type EditorLine,
} from "../../_components/bill-lines-editor";

const toEditor = (row: BillLineRow): EditorLine =>
  toEditorLine(
    {
      kind: row.kind,
      poLineId: row.po_line_id,
      itemId: row.item_id,
      labourLogId: row.labour_log_id,
      workItemId: row.work_item_id,
      description: row.description,
      uom: row.uom,
      quantity: row.quantity,
      rate: row.rate,
      gstPct: row.gst_pct,
      discountAmount: row.discount_amount,
      otherCharges: row.other_charges,
      note: row.note,
    },
    row.id,
  );

/**
 * A recorded bill's lines, edited and saved together. Saving refreshes
 * the page so the header shows the totals the database rolled up.
 */
export function BillLinesPanel({
  billId,
  lines,
  gstRates,
  uoms,
  poLines,
  workLines,
  allowOther,
  locked,
}: {
  billId: string;
  lines: BillLineRow[];
  gstRates: number[];
  uoms: string[];
  poLines?: PoLineForBill[];
  workLines?: WorkOrderLineForBill[];
  allowOther: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditorLine[]>(() => lines.map(toEditor));
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();

  const drafts = draftsOf(editing);
  const problem = editing.length ? billLinesProblem(drafts) : undefined;

  return (
    <div className="space-y-3">
      <BillLinesEditor
        lines={editing}
        onChange={(next) => {
          setEditing(next);
          setSaved(false);
        }}
        gstRates={gstRates}
        uoms={uoms}
        poLines={poLines}
        workLines={workLines}
        allowOther={allowOther}
        lockedQuantities={locked}
      />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {!error && problem && <p className="text-muted text-xs">{problem}</p>}
        <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
        <Button
          disabled={saving || Boolean(problem) || editing.length === 0}
          onClick={() =>
            startSaving(async () => {
              setError(undefined);
              const result = await saveBillLines(billId, drafts);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setSaved(true);
              router.refresh();
            })
          }
        >
          {saving ? "Saving…" : "Save the lines"}
        </Button>
      </div>
    </div>
  );
}
