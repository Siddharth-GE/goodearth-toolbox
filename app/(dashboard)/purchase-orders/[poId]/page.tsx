import { Attribution } from "@/components/ui/attribution";
import { LinkButton } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { listGstRates } from "@/lib/masters/gst-rates";
import { isFullyPriced } from "@/lib/purchase-orders/math";
import {
  getCurrentPoActor,
  getPoBilledTotals,
  getPoFormOptions,
  getPoReceipts,
  getPurchaseOrder,
} from "@/lib/purchase-orders/queries";
import { canEditPo } from "@/lib/purchase-orders/workflow";
import { FileDown } from "lucide-react";
import { notFound } from "next/navigation";
import { PoStatusBadge } from "../_components/status-badge";
import { ActionButtons } from "./_components/action-buttons";
import { BilledSection } from "./_components/billed-section";
import { HeaderFields } from "./_components/header-fields";
import { LineGrid } from "./_components/line-grid";
import { ReceiptsSection } from "./_components/receipts-section";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params;
  const [po, actor, gstRates, receipts, billedTotals] = await Promise.all([
    getPurchaseOrder(poId),
    getCurrentPoActor(),
    listGstRates(),
    getPoReceipts(poId),
    getPoBilledTotals(poId),
  ]);
  if (!po) notFound();

  const editable = canEditPo(po.status);
  // The vendor/store pickers only render on an editable draft — most
  // views of a PO are of issued ones, and paid for the whole options
  // bag (all projects, plots, units, vendors, stores) without using it.
  const options = editable ? await getPoFormOptions() : { vendors: [], stores: [] };
  const activeRates = gstRates.filter((rate) => rate.is_active).map((rate) => rate.rate);
  const fullyPriced = isFullyPriced(
    po.lines.map((line) => ({ quantity: line.quantity, rate: line.rate, gst_pct: line.gst_pct })),
  );

  return (
    <div className="space-y-4">
      <PageTitle
        title={po.reference}
        backHref="/purchase-orders"
        backLabel="All purchase orders"
        description={
          <>
            {po.project_name}
            {po.scope_name ? ` · ${po.scope_name}` : " · General"}
            {` · ${po.vendor_name}`}
          </>
        }
        actions={
          <>
            <LinkButton href={`/purchase-orders/${po.id}/pdf`} variant="secondary" size="sm" plain>
              <FileDown className="size-4" />
              PDF
            </LinkButton>
            <PoStatusBadge status={po.status} />
            <ActionButtons
              poId={po.id}
              status={po.status}
              actor={actor}
              createdBy={po.created_by}
              deletionRequestedBy={po.deletion_requested_by}
              lineCount={po.line_count}
              fullyPriced={fullyPriced}
            />
          </>
        }
      />

      {editable && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            A draft — nothing has gone to the vendor. Add lines from approved indents, price every
            line, then issue it.
          </p>
          <Attribution name={po.created_by_name} label="Raised by" />
        </div>
      )}

      {po.status === "issued" && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Issued to {po.vendor_name}
            {po.issued_at && <span className="text-muted"> on {formatDate(po.issued_at)}</span>} —
            locked.{" "}
            {receipts.length > 0
              ? "Deliveries recorded against it are listed below."
              : "Nothing has been delivered against it yet."}
          </p>
          <Attribution name={po.issued_by_name} label="Issued by" />
        </div>
      )}

      {po.status === "deletion_requested" && (
        <div className="border-warning/40 bg-warning/5 rounded-xl border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground text-sm">
              <span className="font-medium">Deletion requested:</span> {po.deletion_note}
            </p>
            <Attribution name={po.deletion_requested_by_name} label="Requested by" />
          </div>
          <p className="text-muted mt-1 text-xs">
            {actor.isAdmin
              ? "Yours to decide — approve the deletion, or refuse it and the PO stays issued."
              : "Waiting for an admin to decide. The order stays issued until then."}
          </p>
        </div>
      )}

      {po.status === "cancelled" && (
        <div className="border-danger/40 bg-danger/5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div>
            <p className="text-foreground text-sm">
              Cancelled
              {po.cancelled_at && (
                <span className="text-muted"> on {formatDate(po.cancelled_at)}</span>
              )}
              {po.deletion_note && <> — {po.deletion_note}</>}
            </p>
            <p className="text-muted mt-1 text-xs">
              Its quantities went back to the unordered pool; the number stays used.
            </p>
          </div>
          <Attribution name={po.cancelled_by_name} label="Cancelled by" />
        </div>
      )}

      {po.status === "completed" && (
        <div className="border-border bg-surface rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Completed — every line fully received. The deliveries are listed below.
          </p>
        </div>
      )}

      <HeaderFields
        poId={po.id}
        vendorId={po.vendor_id}
        vendorName={po.vendor_name}
        deliverStoreId={po.deliver_store_id}
        deliverNote={po.deliver_note}
        expectedBy={po.expected_by}
        terms={po.terms}
        note={po.note}
        editable={editable}
        vendors={options.vendors}
        stores={options.stores}
      />

      <LineGrid poId={po.id} lines={po.lines} editable={editable} gstRates={activeRates} />

      <ReceiptsSection receipts={receipts} />

      <BilledSection totals={billedTotals} />
    </div>
  );
}
