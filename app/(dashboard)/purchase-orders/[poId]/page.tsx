import { PageTitle } from "@/components/ui/page-title";
import { listGstRates } from "@/lib/masters/gst-rates";
import {
  getCurrentPoActor,
  getPoFormOptions,
  getPurchaseOrder,
} from "@/lib/purchase-orders/queries";
import { canEditPo } from "@/lib/purchase-orders/workflow";
import { notFound } from "next/navigation";
import { PoStatusBadge } from "../_components/status-badge";
import { ActionButtons } from "./_components/action-buttons";
import { HeaderFields } from "./_components/header-fields";
import { LineGrid } from "./_components/line-grid";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params;
  const [po, actor, options, gstRates] = await Promise.all([
    getPurchaseOrder(poId),
    getCurrentPoActor(),
    getPoFormOptions(),
    listGstRates(),
  ]);
  if (!po) notFound();

  const editable = canEditPo(po.status);
  const activeRates = gstRates.filter((rate) => rate.is_active).map((rate) => rate.rate);

  return (
    <div className="space-y-4">
      <PageTitle
        title={po.reference}
        backHref="/purchase-orders"
        backLabel="All purchase orders"
        description={
          <>
            {po.project_name}
            {po.scope_name && ` · ${po.scope_name}`}
            {!po.scope_name && " · General"}
            {` · ${po.vendor_name}`}
          </>
        }
        actions={
          <>
            <PoStatusBadge status={po.status} />
            <ActionButtons
              poId={po.id}
              status={po.status}
              actor={actor}
              createdBy={po.created_by}
            />
          </>
        }
      />

      {editable && (
        <div className="border-border bg-surface rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            A draft — nothing has gone to the vendor. Add lines from approved indents, price every
            line, then issue it (issuing arrives with the next milestone).
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
    </div>
  );
}
