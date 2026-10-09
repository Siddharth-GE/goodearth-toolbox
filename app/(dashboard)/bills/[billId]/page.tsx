import { Attribution } from "@/components/ui/attribution";
import { LinkButton } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import {
  countLabourEntriesOnBill,
  getBillLines,
  getPoLinesForBill,
  getWorkOrderLinesForBill,
} from "@/lib/bills/line-queries";
import { getBill, getCurrentBillActor } from "@/lib/bills/queries";
import { canEditBill } from "@/lib/bills/workflow";
import { formatDate } from "@/lib/format";
import { listActiveGstRates } from "@/lib/masters/gst-rates";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { FileDown } from "lucide-react";
import { notFound } from "next/navigation";
import { BillStatusBadge } from "../_components/status-badge";
import { ActionButtons } from "./_components/action-buttons";
import { BillLinesPanel } from "./_components/bill-lines-panel";
import { BillLinesTable } from "./_components/bill-lines-table";
import { DetailsFields, TotalOverride } from "./_components/details-fields";
import { HeaderFields } from "./_components/header-fields";

export default async function BillPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  const [bill, actor, lines, fromLabour] = await Promise.all([
    getBill(billId),
    getCurrentBillActor(),
    getBillLines(billId),
    countLabourEntriesOnBill(billId),
  ]);
  if (!bill) notFound();

  const editable = canEditBill(bill.status);
  const itemised = lines.length > 0;
  // What the line editor offers, only while the bill can change.
  const [gstRates, uoms, poLines, workLines] = editable
    ? await Promise.all([
        listActiveGstRates(),
        listActiveUomNames(),
        bill.po_id ? getPoLinesForBill(bill.po_id) : Promise.resolve(undefined),
        bill.labour_contract_id && fromLabour === 0
          ? getWorkOrderLinesForBill(bill.labour_contract_id)
          : Promise.resolve(undefined),
      ])
    : [[], [], undefined, undefined];

  const anchorLabel =
    bill.kind === "nmr"
      ? "for daily wages (NMR)"
      : bill.po_reference
        ? `against ${bill.po_reference}`
        : bill.contract_description
          ? `against the work order ${bill.contract_reference ?? ""} "${bill.contract_description}"`
          : null;

  return (
    <div className="space-y-4">
      <PageTitle
        title={bill.reference}
        backHref="/bills/list"
        backLabel="All bills"
        description={
          <>
            {bill.vendor_name ?? "Direct labour — no vendor"}
            {` · ${bill.project_name}`}
            {bill.scope_name ? ` · ${bill.scope_name}` : " · General"}
            {bill.kind === "nmr" ? " · NMR daily wages" : ""}
            {bill.po_reference ? ` · ${bill.po_reference}` : ""}
            {bill.contract_reference ? ` · ${bill.contract_reference}` : ""}
          </>
        }
        actions={
          <>
            <LinkButton href={`/bills/${bill.id}/pdf`} variant="secondary" size="sm" plain>
              <FileDown className="size-4" />
              Print
            </LinkButton>
            <BillStatusBadge status={bill.status} />
            <ActionButtons
              billId={bill.id}
              status={bill.status}
              actor={actor}
              createdBy={bill.created_by}
              totalAmount={bill.total_amount}
            />
          </>
        }
      />

      {editable && bill.rejection_note && (
        <div className="border-warning/40 bg-warning/5 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            <span className="font-medium">Sent back:</span> {bill.rejection_note}
          </p>
          <p className="text-muted mt-1 text-xs">
            Fix the figures below — the next approval clears this note.
          </p>
        </div>
      )}

      {editable && !bill.rejection_note && (
        <div className="border-border bg-surface rounded-xl border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground text-sm">
              Recorded {anchorLabel} — waiting for approval. The lines can still be corrected.
            </p>
            <Attribution name={bill.created_by_name} label="Recorded by" />
          </div>
          <p className="text-muted mt-1 text-xs">
            {actor.isAdmin || actor.isApprover
              ? "Yours to decide — approve it, or delete it if it was recorded wrongly."
              : "Waiting for a named bill approver or an admin."}
          </p>
        </div>
      )}

      {bill.status === "approved" && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Approved
            {bill.approved_at && (
              <span className="text-muted"> on {formatDate(bill.approved_at)}</span>
            )}
            {" — "}ready to pay.
          </p>
          <Attribution name={bill.approved_by_name} label="Approved by" />
        </div>
      )}

      {bill.status === "paid" && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Paid
            {bill.paid_at && <span className="text-muted"> on {formatDate(bill.paid_at)}</span>}
            {bill.payment_ref && (
              <>
                {" · ref "}
                <span className="font-mono text-xs">{bill.payment_ref}</span>
              </>
            )}
          </p>
          <Attribution name={bill.paid_by_name} label="Paid by" />
        </div>
      )}

      {itemised ? (
        <DetailsFields
          billId={bill.id}
          invoiceNo={bill.invoice_no}
          invoiceDate={bill.invoice_date}
          note={bill.note}
          taxableAmount={bill.taxable_amount}
          gstAmount={bill.gst_amount}
          totalAmount={bill.total_amount}
          editable={editable}
        />
      ) : (
        // A bill from before bills had lines keeps its typed figures.
        <HeaderFields
          billId={bill.id}
          invoiceNo={bill.invoice_no}
          invoiceDate={bill.invoice_date}
          taxableAmount={bill.taxable_amount}
          gstAmount={bill.gst_amount}
          totalAmount={bill.total_amount}
          note={bill.note}
          editable={editable}
        />
      )}

      {bill.kind === "nmr" && itemised && editable && (
        <TotalOverride
          billId={bill.id}
          currentTotal={bill.total_amount}
          overrideNote={bill.total_override_note}
        />
      )}
      {bill.kind === "nmr" && itemised && !editable && bill.total_override_note && (
        <p className="text-muted text-sm">{`Total set by hand — ${bill.total_override_note}`}</p>
      )}

      <div className="space-y-2">
        <h2 className="text-foreground text-lg font-bold tracking-tight">Lines</h2>
        {editable ? (
          <>
            {!itemised && (
              <p className="text-muted text-sm">
                This bill has no lines — its figures are the ones typed above. Adding lines makes
                the figures follow them.
              </p>
            )}
            <BillLinesPanel
              billId={bill.id}
              lines={lines}
              gstRates={gstRates.map((rate) => rate.rate)}
              uoms={uoms}
              poLines={poLines}
              workLines={workLines}
              allowOther={bill.kind !== "po"}
              locked={fromLabour > 0}
            />
          </>
        ) : itemised ? (
          <BillLinesTable lines={lines} />
        ) : (
          <p className="text-muted text-sm">
            Recorded before bills had lines — its figures are the ones above.
          </p>
        )}
      </div>
    </div>
  );
}
