import { Attribution } from "@/components/ui/attribution";
import { PageTitle } from "@/components/ui/page-title";
import { getBill, getCurrentBillActor } from "@/lib/bills/queries";
import { canEditBill } from "@/lib/bills/workflow";
import { formatDate } from "@/lib/format";
import { notFound } from "next/navigation";
import { BillStatusBadge } from "../_components/status-badge";
import { ActionButtons } from "./_components/action-buttons";
import { HeaderFields } from "./_components/header-fields";

export default async function BillPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  const [bill, actor] = await Promise.all([getBill(billId), getCurrentBillActor()]);
  if (!bill) notFound();

  const editable = canEditBill(bill.status);
  const anchorLabel = bill.po_reference
    ? `against ${bill.po_reference}`
    : bill.contract_description
      ? `against the contract "${bill.contract_description}"`
      : null;

  return (
    <div className="space-y-4">
      <PageTitle
        title={bill.reference}
        backHref="/bills"
        backLabel="All bills"
        description={
          <>
            {bill.vendor_name}
            {` · ${bill.project_name}`}
            {bill.scope_name ? ` · ${bill.scope_name}` : " · General"}
            {bill.po_reference ? ` · ${bill.po_reference}` : ""}
            {bill.contract_description ? ` · ${bill.contract_description}` : ""}
          </>
        }
        actions={
          <>
            <BillStatusBadge status={bill.status} />
            <ActionButtons
              billId={bill.id}
              status={bill.status}
              actor={actor}
              createdBy={bill.created_by}
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
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Recorded {anchorLabel} — waiting for approval. The figures can still be corrected.
          </p>
          <Attribution name={bill.created_by_name} label="Recorded by" />
        </div>
      )}

      {bill.status === "approved" && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Approved
            {bill.approved_at && (
              <span className="text-muted"> on {formatDate(bill.approved_at)}</span>
            )}
            {" — "}ready to pay. Marking it paid needs the payment reference.
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
    </div>
  );
}
